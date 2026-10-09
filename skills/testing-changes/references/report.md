# Report

Written after the tests while the apps are still running, in Russian, from the recorded results. Every claim has evidence from the run; never write "passed" for a test that was not run.

**Evidence goes into the report itself, as data.** The report is read in Plannotator, where file links cannot be opened. For every test (passed or failed) paste the actual data in a code block: the DB query output, the `curl` status and response body, the script output, a snapshot or console excerpt. Trim long output to the lines that prove the result and say it was trimmed. A path under `tmp/reports/<run>/` may be added next to the data, never instead of it. Screenshots are the only evidence that stays a path: describe in words what the screenshot shows.

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

## Подробности

### T1. <название>
- **Ожидалось:** <из тест-плана>
- **Получено:** <факт одной-двумя строками>
- **Данные:**

```
<вывод БД, статус и тело ответа curl, вывод скрипта: сами данные, не ссылка на файл>
```

(блок на каждый тест, пройденный или проваленный)

## Ошибки

### T2. <название>
- **Ожидалось:** <из тест-плана>
- **Получено:** <факт: статус, тело, текст в интерфейсе>
- **Отличие:** <что именно не совпало>
- **Шаги воспроизведения:** <команды и действия>
- **Доказательства:** <ответ curl, фрагмент лога и вывод скрипта прямо в блоке кода; для скриншота путь и описание словами>
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
