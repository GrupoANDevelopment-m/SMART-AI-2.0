# Security Spec

## 1. Data Invariants
- `setups`: Must correspond to `Setup` entity. Must be owned by `uid == request.auth.uid`. Time must be server timestamp.
- `strategies`: Strategy entity. Owner must be `uid == request.auth.uid`.
- `goals`: Goal entity. Owner must be `uid == request.auth.uid`.
- `knowledge`: Knowledge entity. Owner must be `uid == request.auth.uid`.
- `skills`: Skill entity. Owner must be `uid == request.auth.uid`.
- `state`: AgentState entity. Owner must be `uid == request.auth.uid`.
- `chats`: ChatMessage entity. Owner must be `uid == request.auth.uid`. Time must be server timestamp.
- `agent_memory`: AgentMemory entity. Owner must be `uid == request.auth.uid`.
- `episodic_memory`: EventMemory entity. Owner must be `uid == request.auth.uid`. Time must be server timestamp.
- `semantic_memory`: EventMemory entity. Owner must be `uid == request.auth.uid`. Time must be server timestamp.

## 2. Dirty Dozen Payloads
1. Create Setup without uid -> DENY
2. Create Setup with someone else's uid -> DENY
3. Create Setup with string confidence -> DENY
4. Update Setup uid -> DENY
5. Create ChatMessage with invalid role -> DENY
6. List ChatMessages without where("uid", "==", uid) -> DENY
7. Create AgentState with missing uid -> DENY
8. Get AgentState for different user -> DENY
9. Create EpisodicMemory without createdAt timestamp -> DENY
10. Create Knowledge with number for content -> DENY
11. Update Knowledge with affectedKeys not matching -> DENY
12. Create Strategy with extra fields -> DENY

## 3. Test Runner
We will create `firestore.rules.test.ts`.