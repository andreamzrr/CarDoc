# Security Specification for CarDoc Garage

## 1. Data Invariants
- A Vehicle must be owned by the user creating it (`ownerId == request.auth.uid`).
- A Maintenance Log must belong to a Vehicle that the user owns.
- Mileage must be a positive integer.
- Update timestamps must match `request.time`.

## 2. The "Dirty Dozen" Payloads (Threat Assessment)
1. **Identity Spoofing**: Attempt to create a vehicle with `ownerId` of another user. (DENY)
2. **Orphaned Write**: Attempt to create a log for a vehicle ID that doesn't exist. (DENY)
3. **Cross-Tenant Access**: User A attempts to read User B's vehicle list. (DENY)
4. **Id Poisoning**: Injecting 1MB string as a vehicle ID. (DENY)
5. **Mileage rollback**: (Business logic, normally allow, but here we focus on security).
6. **Immutable Field Tamper**: Changing `ownerId` on an existing vehicle. (DENY)
7. **Shadow Field Injection**: Adding `isVerified: true` to a vehicle doc. (DENY)
8. **Malicious Recall injection**: (If we allowed users to write global state, which we don't).
9. **Recursive Cost Attack**: Deeply nested collection scrap. (DENY)
10. **Blanket Read Scam**: Listing all vehicles in the database. (DENY)
11. **Negative Mileage**: Setting mileage to -500. (DENY)
12. **Future Service**: Setting maintenance date to 2050 (if we validate future dates).

## 3. Test Runner Concept (Validation logic)
We will verify that:
- `get` on a vehicle only works if `resource.data.ownerId == request.auth.uid`.
- `create` on a vehicle requires `isValidVehicle()`.
- `update` on a vehicle requires `ownerId` to be immutable.
- `list` on logs requires `get()` on the parent vehicle to verify ownership.
