# Naming

- No `Interface` suffix on interface/type names (`CreateUserRequest`, not `CreateUserRequestInterface`).
- Avoid filler words such as `Data`/`Info` when the name already conveys the meaning. Keep meaningful directional words such as `Request`/`Response`.
- Required fields precede optional fields in interfaces, types, DTOs, and class fields.
- Non-null assertion (`!`) is forbidden except the documented framework-validated DTO exception in `rules/nestjs/dto.md`; use guards or narrowed types.
- A pass-through outbound/event object is named `payload`, not `request`.
- No re-export of a variable/type under a new name for renaming's sake alone (`export const LOCAL_NAME = IMPORTED_NAME;` with no distinct value) — import and use the original name directly.
