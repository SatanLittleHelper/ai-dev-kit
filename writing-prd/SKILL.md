---
name: writing-prd
description: Use when asked to write a PRD, "product requirements document", "написать ПРД", "продуктовые требования" for a feature — governs the document's required sections, storage location, and naming, independent of any single project's rules.
---

# Writing PRD

## Overview

Template + formatting rules for PRDs, usable in any repository. Not an interview — assemble the document from what's already known in the conversation; ask only if a required section is genuinely unfillable.

## When to use

- User asks to write/draft a PRD, "продуктовые требования", "product requirements document".
- Goal/scope not yet decided? Run `superpowers:brainstorming` first — PRD documents a decision, doesn't make one.

## Storage & naming

Same `docs/` convention as roadmaps (see `roadmap-conventions`, itself project-agnostic):

- `docs/<feature-slug>/YYYY-MM-DD-<feature-slug>-prd.md` at repo root.
- Git-tracked, kept permanently — never `tmp/`, never deleted after shipping.
- If the current environment offers native Plan Mode (`EnterPlanMode`/`ExitPlanMode`), use it like `brainstorming`/`writing-plans`: draft in Plan Mode's service file, `ExitPlanMode`, save to `docs/` only after approval. If Plan Mode isn't available (e.g. a dispatched subagent), draft the content in chat first and get explicit user approval before saving.
- Never commit automatically — only on explicit request.

## Template

```markdown
# <Feature name> — PRD

**Тикет:** `TBD` (реальный номер сообщает пользователь, в трекере проекта — не угадывать)
**Дата:** YYYY-MM-DD
**Статус:** Draft / In Review / Approved

## Проблема и контекст

Какая проблема существует сейчас, у кого, почему это важно решить именно сейчас.

## Цели

Что должно стать правдой в результате. Измеримо, где возможно.

## Не цели

Что сознательно остаётся вне рамок этой задачи — предотвращает расползание скоупа.

## Юзкейсы

Формат `Действие → Результат`, один на строку. Пример: `Пользователь открывает заявку с новым комментарием → видит уведомление о комментарии и переходит к нему`.

## Требования

### Функциональные

Пронумерованный список конкретных, проверяемых требований. Без «быстро»/«удобно»/«современно» — только измеримое:

```diff
- Поиск должен быть быстрым и удобным.
+ Поиск должен возвращать результат за ≤200мс на 10k записей.
```

### Нефункциональные

Производительность, безопасность, доступность, совместимость — только то, что реально применимо.

## Метрики успеха

3-5 измеримых KPI, не расплывчатые формулировки вроде «улучшить UX».

## Риски и открытые вопросы

Что неизвестно или может пойти не так; кто должен на это ответить.

## Вне скоупа / дальнейшие шаги

Что явно откладывается на будущее.
```

## Formatting rules

- Body language matches how the user communicates in this conversation (default: Russian) — no project-file lookup needed to decide this.
- Section inapplicable? Keep the heading, write `Не применимо` — don't delete it.
- Unknown fact (ticket, stack, deadline, integration detail) → literal `TBD`, never guess. Ticket number specifically: only the user supplies the real one, in whatever format their tracker uses — never invent a prefix or number.
- No filler — facts and decisions only, not a narrative of the conversation.

## Common mistakes

| Mistake | Fix |
|---|---|
| Writing the PRD before the goal/scope is actually decided | Run `brainstorming` first; PRD documents a decision, it doesn't discover one |
| Saving straight to `docs/` without approval | Draft first (Plan Mode if available, chat otherwise), save only after explicit approval |
| Guessing a ticket number/prefix or any unstated fact (stack, deadline, integration) | Use `TBD` until the user supplies it |
| Dropping a template section instead of marking it not applicable | Keep the heading, write `Не применимо` with a one-line reason |
| Assuming a project-specific storage path or ticket format from a project's CLAUDE.md | This skill doesn't read project rule files — ask the user if a project convention should override the defaults above |
