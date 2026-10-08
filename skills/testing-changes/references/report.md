# Report

Written after the tests while the apps are still running, in Russian, from the recorded results. Every claim has evidence from the run; never write "passed" for a test that was not run.

## Template

```markdown
# Отчёт о тестировании: <тикет> <название>

> Чтобы завершить тестирование и остановить запущенные приложения, нажмите «Done» в Plannotator. Пока отчёт не одобрен, приложения продолжают работать.

**Дата:** YYYY-MM-DD
**Ветка:** `<ветка>`
**Тест-план:** `<путь>`
**Вердикт:** ПРОЙДЕНО | ЕСТЬ ОШИБКИ | ЕСТЬ ПРОПУСКИ

## Сводка

| Всего | Пройдено | Провалено | Пропущено |
|---|---|---|---|
| N | N | N | N |

## Результаты

| ID | Тест | Статус |
|---|---|---|
| T1 | <название> | пройден |
| T2 | <название> | провален |

## Ошибки

### T2. <название>
- **Ожидалось:** <из тест-плана>
- **Получено:** <факт: статус, тело, текст в интерфейсе>
- **Отличие:** <что именно не совпало>
- **Шаги воспроизведения:** <команды и действия>
- **Доказательства:** <ответ curl, путь к скриншоту, фрагмент лога>
- **Предположительная причина:** <если ясна по логам, иначе «не установлена»>

## Пропущенные тесты

<ID, причина, или «нет»>

## Побочные эффекты после тестов

<что осталось и что сделать вручную, или «нет»>

## Окружение

<какие приложения запущены и работают до одобрения отчёта, какие были чужими, где логи>
```

Verdict: `ПРОЙДЕНО` only when every test passed; any failed test gives `ЕСТЬ ОШИБКИ`; skipped tests without failures give `ЕСТЬ ПРОПУСКИ`.

## Save

- Roadmap step: `docs/<feature-slug>/steps/<step-slug>/YYYY-MM-DD-<ticket>-test-report.md`.
- Otherwise: `tmp/reports/YYYY-MM-DD-<branch>-test-report.md`.

## Show

Show the saved report with Plannotator: invoke the `plannotator-annotate` skill on the report file (`plannotator annotate <path>`). Keep the turn open until it returns a final result; an empty poll is not a result. Outcomes: approved ("Done") → Teardown, then Cleanup of documents: delete the test plan, ask whether to delete the report (`references/environment.md`). Annotations → handle each one; the apps keep running, so a re-check is possible; show the updated report again. Dismissed → Teardown only (plan and report stay). Then process every annotation before continuing. Fix code only if the user asks. Never commit the report unless the user asks.
