import { adminDb } from './firebaseAdmin.js';

interface Quote {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

class DataManager {
  // Hot Storage (RAM)
  private hotQuotes: Record<string, Quote[]> = {};
  private readonly ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  constructor() {
    // Run cleanup every hour
    setInterval(() => this.archiveColdData(), 60 * 60 * 1000);
  }

  public addQuote(asset: string, quote: Quote) {
    if (!this.hotQuotes[asset]) {
      this.hotQuotes[asset] = [];
    }
    this.hotQuotes[asset].push(quote);
  }

  public getHotQuotes(asset: string): Quote[] {
    return this.hotQuotes[asset] || [];
  }

  // Move data older than 1 week to Firebase (Cold Storage)
  private async archiveColdData() {
    if (!adminDb) return;
    
    const now = Date.now();
    const cutoffTime = now - this.ONE_WEEK_MS;

    for (const asset of Object.keys(this.hotQuotes)) {
      const quotes = this.hotQuotes[asset];
      
      // Find quotes older than 1 week
      const coldQuotes = quotes.filter(q => q.timestamp < cutoffTime);
      
      if (coldQuotes.length > 0) {
        try {
          // Save to Firebase
          const batch = adminDb.batch();
          const assetRef = adminDb.collection('market_data').doc(asset);
          
          // We store them in chunks or subcollections to avoid 1MB limit
          coldQuotes.forEach(q => {
            const docRef = assetRef.collection('historical').doc(q.timestamp.toString());
            batch.set(docRef, q);
          });

          await batch.commit();
          console.log(`Archived ${coldQuotes.length} quotes for ${asset} to Firebase.`);

          // Remove from RAM
          this.hotQuotes[asset] = quotes.filter(q => q.timestamp >= cutoffTime);
        } catch (error) {
          console.error(`Failed to archive data for ${asset}:`, error);
        }
      }
    }
  }
}

export const dataManager = new DataManager();
