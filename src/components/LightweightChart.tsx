import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time, LineStyle, CandlestickSeries, AreaSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { MarketData, ChartDrawing, AlertZone } from '../types';

interface LightweightChartProps {
  data: MarketData[];
  chartType: 'candles' | 'line';
  indicators?: string[];
  drawings?: ChartDrawing[];
  alertZones?: AlertZone[];
  height?: number;
}

export const LightweightChart: React.FC<LightweightChartProps> = ({ data, chartType, indicators = [], drawings = [], alertZones = [], height = 350 }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const drawingsRef = useRef<ISeriesApi<any>[]>([]);
  const priceLinesRef = useRef<any[]>([]);
  const markersPluginRef = useRef<any>(null);
  const seriesTimesRef = useRef<Set<Time>>(new Set());

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a', style: 1 },
        horzLines: { color: '#27272a', style: 1 },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#27272a',
      },
      rightPriceScale: {
        borderColor: '#27272a',
      },
      crosshair: {
        mode: 1, // Normal mode
        vertLine: { color: '#52525b', labelBackgroundColor: '#18181b' },
        horzLine: { color: '#52525b', labelBackgroundColor: '#18181b' },
      }
    });

    chartRef.current = chart;

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]);

  // Recreate series only when chartType changes
  useEffect(() => {
    if (!chartRef.current) return;

    if (seriesRef.current) {
      try {
        chartRef.current.removeSeries(seriesRef.current);
      } catch (e: any) {
        if (e && e.message !== 'Value is undefined') {
          console.error("Error removing series:", e);
        }
      }
      markersPluginRef.current = null;
      priceLinesRef.current = [];
      
      // Also clear any drawing series
      drawingsRef.current.forEach(series => {
        try {
          chartRef.current?.removeSeries(series);
        } catch (e: any) {
          if (e && e.message !== 'Value is undefined') {
            console.error("Error removing drawing series:", e);
          }
        }
      });
      drawingsRef.current = [];
    }

    if (chartType === 'candles') {
      seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
      });
    } else {
      seriesRef.current = chartRef.current.addSeries(AreaSeries, {
        lineColor: '#10b981',
        topColor: 'rgba(16, 185, 129, 0.3)',
        bottomColor: 'rgba(16, 185, 129, 0)',
        lineWidth: 2,
      });
    }
  }, [chartType]);

  // Update data when data changes
  useEffect(() => {
    if (!seriesRef.current || !data || data.length === 0) return;

    // Format data for lightweight-charts
    const formattedData = data
      .filter(d => d.price !== undefined && !isNaN(Number(d.price)) && d.time)
      .map(d => {
      let timestamp: Time;
      
      // Try to parse time
      if (typeof d.time === 'number') {
        timestamp = d.time as Time;
      } else if (typeof d.time === 'string') {
        const numTime = Number(d.time);
        if (!isNaN(numTime) && d.time.trim() !== '') {
          // If it's a string of digits, it might be a timestamp in seconds or milliseconds
          timestamp = numTime > 1e11 ? Math.floor(numTime / 1000) as Time : numTime as Time;
        } else {
          const parsedDate = new Date(d.time);
          if (!isNaN(parsedDate.getTime())) {
            timestamp = Math.floor(parsedDate.getTime() / 1000) as Time;
          } else if (d.time.includes(':')) {
            const parts = d.time.split(':');
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            
            if (!isNaN(hours) && !isNaN(minutes)) {
              const date = new Date();
              let finalHours = hours;
              if (d.time.toLowerCase().includes('pm') && hours < 12) finalHours += 12;
              if (d.time.toLowerCase().includes('am') && hours === 12) finalHours = 0;
              
              date.setHours(finalHours);
              date.setMinutes(minutes);
              date.setSeconds(0);
              date.setMilliseconds(0);
              timestamp = Math.floor(date.getTime() / 1000) as Time;
            } else {
              timestamp = Math.floor(Date.now() / 1000) as Time;
            }
          } else {
            timestamp = Math.floor(Date.now() / 1000) as Time;
          }
        }
      } else {
        timestamp = Math.floor(Date.now() / 1000) as Time;
      }

      const price = Number(d.price);
      const safePrice = isNaN(price) ? 0 : price;

      if (chartType === 'candles') {
        const open = d.open !== undefined && !isNaN(Number(d.open)) ? Number(d.open) : safePrice;
        const high = d.high !== undefined && !isNaN(Number(d.high)) ? Number(d.high) : safePrice;
        const low = d.low !== undefined && !isNaN(Number(d.low)) ? Number(d.low) : safePrice;
        const close = d.close !== undefined && !isNaN(Number(d.close)) ? Number(d.close) : safePrice;
        return {
          time: timestamp,
          open,
          high,
          low,
          close,
        };
      } else {
        return {
          time: timestamp,
          value: safePrice,
        };
      }
    })
    .filter(d => !isNaN(d.time as number));

    // Sort by time to ensure ascending order required by lightweight-charts
    formattedData.sort((a: any, b: any) => a.time - b.time);

    // Remove duplicates
    const uniqueData = [];
    const seenTimes = new Set<Time>();
    for (const item of formattedData) {
      if (!seenTimes.has(item.time)) {
        seenTimes.add(item.time);
        uniqueData.push(item);
      }
    }
    seriesTimesRef.current = seenTimes;

    if (uniqueData.length > 0) {
      try {
        seriesRef.current.setData(uniqueData as any);
      } catch (e) {
        console.error("Error setting chart data:", e, "Data:", uniqueData.slice(0, 5));
      }
    }

  }, [data, chartType]);

  // Handle drawings (horizontal lines, markers, etc.)
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    // Clear previous drawings
    drawingsRef.current.forEach(series => {
      try {
        chartRef.current?.removeSeries(series);
      } catch (e: any) {
        if (e && e.message !== 'Value is undefined') {
          console.error("Error removing series:", e);
        }
      }
    });
    drawingsRef.current = [];
    
    // Clear price lines
    priceLinesRef.current.forEach(priceLine => {
      try {
        seriesRef.current?.removePriceLine(priceLine);
      } catch (e) {
        console.error("Error removing price line:", e);
      }
    });
    priceLinesRef.current = [];

    const markers: any[] = [];

    drawings.forEach(drawing => {
      if (!drawing || !drawing.points || !Array.isArray(drawing.points)) return;

      if (drawing.type === 'horizontal_line' && drawing.points.length > 0) {
        const price = Number(drawing.points[0].price);
        if (price !== undefined && !isNaN(price)) {
          const priceLineOptions = {
            price: price,
            color: drawing.options?.color || '#3b82f6',
            lineWidth: 2 as any,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: drawing.options?.title || 'Level',
          };
          const priceLine = seriesRef.current?.createPriceLine(priceLineOptions);
          if (priceLine) {
            priceLinesRef.current.push(priceLine);
          }
        }
      } else if (drawing.type === 'trend_line' && drawing.points.length >= 2) {
        // Create a new line series for the trendline
        const lineSeries = chartRef.current!.addSeries(LineSeries, {
          color: drawing.options?.color || '#eab308',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        
        // Convert points to lightweight-charts format
        const lineData = drawing.points
          .map(p => ({ ...p, price: Number(p.price) }))
          .filter(p => !isNaN(p.price) && p.time)
          .map(p => {
            let timestamp: Time;
            if (typeof p.time === 'number') {
              timestamp = p.time as Time;
            } else if (typeof p.time === 'string') {
              const numTime = Number(p.time);
              if (!isNaN(numTime) && p.time.trim() !== '') {
                timestamp = numTime > 1e11 ? Math.floor(numTime / 1000) as Time : numTime as Time;
              } else {
                const parsedDate = new Date(p.time);
                if (!isNaN(parsedDate.getTime())) {
                  timestamp = Math.floor(parsedDate.getTime() / 1000) as Time;
                } else if (p.time.includes(':')) {
                  const parts = p.time.split(':');
                  const hours = parseInt(parts[0], 10);
                  const minutes = parseInt(parts[1], 10);
                  if (!isNaN(hours) && !isNaN(minutes)) {
                    const date = new Date();
                    let finalHours = hours;
                    if (p.time.toLowerCase().includes('pm') && hours < 12) finalHours += 12;
                    if (p.time.toLowerCase().includes('am') && hours === 12) finalHours = 0;
                    date.setHours(finalHours);
                    date.setMinutes(minutes);
                    date.setSeconds(0);
                    date.setMilliseconds(0);
                    timestamp = Math.floor(date.getTime() / 1000) as Time;
                  } else {
                    timestamp = Math.floor(Date.now() / 1000) as Time;
                  }
                } else {
                  timestamp = Math.floor(Date.now() / 1000) as Time;
                }
              }
            } else {
              timestamp = Math.floor(Date.now() / 1000) as Time;
            }

            const price = Number(p.price);
            const safePrice = isNaN(price) ? 0 : price;

            return {
              time: timestamp,
              value: safePrice
            };
          })
          .filter(p => !isNaN(p.time as number))
          .sort((a, b) => (a.time as number) - (b.time as number));

        if (lineData.length > 0) {
          // Remove duplicates
          const uniqueLineData = [];
          const seenLineTimes = new Set();
          for (const item of lineData) {
            if (!seenLineTimes.has(item.time)) {
              seenLineTimes.add(item.time);
              uniqueLineData.push(item);
            }
          }
          
          if (uniqueLineData.length > 0) {
            try {
              lineSeries.setData(uniqueLineData);
              drawingsRef.current.push(lineSeries);
            } catch (e) {
              console.error("Error setting line series data:", e, "Data:", uniqueLineData);
              try {
                chartRef.current!.removeSeries(lineSeries);
              } catch (removeError) {
                // Ignore
              }
            }
          } else {
            try {
              chartRef.current!.removeSeries(lineSeries);
            } catch (e: any) {
              if (e && e.message !== 'Value is undefined') {
                console.error("Error removing line series:", e);
              }
            }
          }
        } else {
          try {
            chartRef.current!.removeSeries(lineSeries);
          } catch (e: any) {
            if (e && e.message !== 'Value is undefined') {
              console.error("Error removing line series:", e);
            }
          }
        }
      } else if (drawing.type === 'marker' && drawing.points.length > 0) {
        if (drawing.points[0].time) {
          let timestamp: Time;
          const timeStr = drawing.points[0].time;
          
          if (typeof timeStr === 'number') {
            timestamp = timeStr as Time;
          } else if (typeof timeStr === 'string') {
            const numTime = Number(timeStr);
            if (!isNaN(numTime) && timeStr.trim() !== '') {
              timestamp = numTime > 1e11 ? Math.floor(numTime / 1000) as Time : numTime as Time;
            } else {
              const parsedDate = new Date(timeStr);
              if (!isNaN(parsedDate.getTime())) {
                timestamp = Math.floor(parsedDate.getTime() / 1000) as Time;
              } else if (timeStr.includes(':')) {
                const parts = timeStr.split(':');
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                if (!isNaN(hours) && !isNaN(minutes)) {
                  const date = new Date();
                  let finalHours = hours;
                  if (timeStr.toLowerCase().includes('pm') && hours < 12) finalHours += 12;
                  if (timeStr.toLowerCase().includes('am') && hours === 12) finalHours = 0;
                  date.setHours(finalHours);
                  date.setMinutes(minutes);
                  date.setSeconds(0);
                  date.setMilliseconds(0);
                  timestamp = Math.floor(date.getTime() / 1000) as Time;
                } else {
                  timestamp = Math.floor(Date.now() / 1000) as Time;
                }
              } else {
                timestamp = Math.floor(Date.now() / 1000) as Time;
              }
            }
          } else {
            timestamp = Math.floor(Date.now() / 1000) as Time;
          }
          
          if (!isNaN(timestamp as number)) {
            markers.push({
              time: timestamp,
              position: drawing.options?.position || 'aboveBar',
              color: drawing.options?.color || '#f43f5e',
              shape: drawing.options?.shape || 'arrowDown',
              text: drawing.options?.text || 'Signal',
            });
          }
        }
      }
    });

    // Plot alertZones (SMC Zones)
    alertZones.forEach(zone => {
      const isSupport = zone.type?.toLowerCase().includes('support') || zone.type?.toLowerCase().includes('bullish') || zone.name?.toLowerCase().includes('bullish') || zone.name?.toLowerCase().includes('support');
      const baseColor = isSupport ? 'rgba(16, 185, 129' : 'rgba(244, 63, 94';
      
      if (zone.maxPrice) {
        const topOptions = {
          price: zone.maxPrice,
          color: `${baseColor}, 0.5)`,
          lineWidth: 2 as any,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `T: ${zone.name}`,
        };
        const topPriceLine = seriesRef.current?.createPriceLine(topOptions);
        if (topPriceLine) priceLinesRef.current.push(topPriceLine);
      }

      if (zone.minPrice) {
        const bottomOptions = {
          price: zone.minPrice,
          color: `${baseColor}, 0.5)`,
          lineWidth: 2 as any,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `B: ${zone.name}`,
        };
        const bottomPriceLine = seriesRef.current?.createPriceLine(bottomOptions);
        if (bottomPriceLine) priceLinesRef.current.push(bottomPriceLine);
      }

      if (zone.maxPrice && zone.minPrice) {
        const meanOptions = {
          price: (zone.maxPrice + zone.minPrice) / 2,
          color: `${baseColor}, 0.8)`,
          lineWidth: 1 as any,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false,
          title: `M: ${zone.name}`,
        };
        const meanPriceLine = seriesRef.current?.createPriceLine(meanOptions);
        if (meanPriceLine) priceLinesRef.current.push(meanPriceLine);
      }
    });

    try {
      if (!markersPluginRef.current && seriesRef.current) {
        markersPluginRef.current = createSeriesMarkers(seriesRef.current, []);
      }
    } catch (e) {
      console.error("Error creating markers plugin:", e);
    }

    if (markers.length > 0) {
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      
      // Remove duplicates and ensure time exists in series
      const uniqueMarkers = [];
      const seenMarkerTimes = new Set();
      const seriesTimes = seriesTimesRef.current;
      
      for (const item of markers) {
        if (!seenMarkerTimes.has(item.time) && seriesTimes.has(item.time)) {
          seenMarkerTimes.add(item.time);
          uniqueMarkers.push(item);
        }
      }
      
      try {
        markersPluginRef.current?.setMarkers(uniqueMarkers);
      } catch (e) {
        console.error("Error setting markers:", e);
      }
    } else {
      try {
        markersPluginRef.current?.setMarkers([]);
      } catch (e) {
        console.error("Error clearing markers:", e);
      }
    }

  }, [drawings, alertZones, data, chartType]); // Re-run when drawings, alertZones, data, or chartType changes

  return <div ref={chartContainerRef} className="w-full h-full" />;
};
