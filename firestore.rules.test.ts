import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { describe, beforeAll, afterAll, beforeEach, it } from 'vitest';

let testEnv: any;
const PROJECT_ID = 'secure-rules-test';

describe('Firestore Security Rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync('DRAFT_firestore.rules', 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const generateMockSetup = (uid: string) => ({
    asset: 'EURUSD',
    type: 'BUY',
    confidence: 0.8,
    smcContext: { trend: 'up' },
    elliottWave: '3',
    outcome: 'PENDING',
    timestamp: '2025-01-01T00:00:00Z',
    uid: uid
  });

  it('1. Create Setup without uid -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    const data = generateMockSetup('alice');
    delete (data as any).uid;
    await assertFails(addDoc(collection(db, 'setups'), data));
  });

  it('2. Create Setup with someone else\'s uid -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    const data = generateMockSetup('bob');
    await assertFails(addDoc(collection(db, 'setups'), data));
  });

  it('3. Create Setup with string confidence -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    const data = generateMockSetup('alice');
    (data as any).confidence = 'high';
    await assertFails(addDoc(collection(db, 'setups'), data));
  });

  it('4. Update Setup uid -> DENY', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      const db = context.firestore();
      await setDoc(doc(db, 'setups/123'), generateMockSetup('alice'));
    });
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    await assertFails(updateDoc(doc(db, 'setups/123'), { uid: 'bob' }));
  });

  it('5. Create ChatMessage with invalid role -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    const data = { role: 'admin', content: 'hello', timestamp: 'xyz', uid: 'alice' };
    await assertFails(addDoc(collection(db, 'chats'), data));
  });

  it('6. List ChatMessages without where("uid", "==", uid) -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    await assertFails(getDocs(collection(db, 'chats')));
    // With where it should succeed given our rule:
    await assertSucceeds(getDocs(query(collection(db, 'chats'), where('uid', '==', 'alice'))));
  });

  it('7. Create AgentState with missing uid -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    await assertFails(setDoc(doc(db, 'state/alice'), { mood: 'NEUTRAL' }));
  });

  it('8. Get AgentState for different user -> DENY', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      const db = context.firestore();
      await setDoc(doc(db, 'state/bob'), { mood: 'NEUTRAL', uid: 'bob' });
    });
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    await assertFails(getDoc(doc(db, 'state/bob')));
  });

  it('9. Create EpisodicMemory without createdAt timestamp -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    await assertFails(addDoc(collection(db, 'episodic_memory'), { uid: 'alice' }));
  });

  it('10. Create Knowledge with number for content -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    await assertFails(addDoc(collection(db, 'knowledge'), { title: 'T', content: 123, uid: 'alice' }));
  });

  it('11. Update Knowledge with affectedKeys not matching -> DENY', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      const db = context.firestore();
      await setDoc(doc(db, 'knowledge/123'), { title: 'T', content: 'abc', uid: 'alice' });
    });
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    // Cannot update uid
    await assertFails(updateDoc(doc(db, 'knowledge/123'), { uid: 'bob' }));
  });

  it('12. Create Strategy with extra fields -> DENY', async () => {
    const context = testEnv.authenticatedContext('alice', { email_verified: true });
    const db = context.firestore();
    const data = { name: 'Strat', successRate: 0.5, totalTrades: 10, uid: 'alice', extraField: 'test' };
    await assertFails(addDoc(collection(db, 'strategies'), data));
  });
});
