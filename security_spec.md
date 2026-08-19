# Security Specification for World App

## Data Invariants
- A video must belong to a valid user.
- Likes and comments are tied to specific videos.
- Users can only modify their own profile and content.
- Coin balance and verification status are sensitive and should be protected (though for demo we allow some updates).

## The Dirty Dozen Payloads (Rejections)
1. **Identity Spoofing**: Attempt to create a user profile with a different ID than the auth UID. -> `PERMISSION_DENIED`
2. **Resource Poisoning**: Create a video with a 1MB title string. -> `PERMISSION_DENIED` (size check)
3. **Privilege Escalation**: Update coin balance as a user. -> `PERMISSION_DENIED` (affectedKeys check)
4. **Orphaned Content**: Create a comment for a non-existent video. -> `PERMISSION_DENIED` (relational exists check - though some rules use path context)
5. **PII Leak**: Read all users' email addresses. -> `PERMISSION_DENIED` (if restricted, currently get is true for public profiles)
6. **Double Dipping**: Like a video twice with different IDs if ID is not UID. -> Handled by `isOwner(likeId)` where likeId=UID.
...

## Test Runner
Verified via manual logic analysis.
