# ai-dev-kit

Личный репозиторий dev-конвенций для работы с ИИ-агентом (Claude Code): часть контента — скиллы (в `plugins/kit/skills/`, поставляются плагином `kit` для Claude Code и Codex), часть — плоские файлы правил (`rules/`), не скиллы, подключаемые через `@import` в CLAUDE.md проекта.

## Состав репозитория

### Скиллы (`plugins/kit/skills/`)

Каждый — папка с `SKILL.md` (описание триггера + логика/процесс с ветвлением):

| Скилл | Что делает |
|---|---|
| `plugins/kit/skills/jira-writer` | Готовит русскоязычные черновики Jira-задач в Jira Wiki Markup (название, описание, критерии приёмки) для ручной вставки или создания задачи через `jira` CLI (Playwright, локальный профиль браузера, пробный запуск `--dry-run`); черновик согласуется через Plannotator без Plan Mode |
| `plugins/kit/skills/roadmap` | Всё, что касается роадмапов — создание, продолжение, взятие чекпоинта, пакетная валидация шагов (см. `skills/roadmap/SKILL.md` и `skills/roadmap/references/`) |
| `plugins/kit/skills/scaffolding-nestjs-app` | Скаффолдинг нового NestJS-приложения по личным конвенциям |
| `plugins/kit/skills/testing-changes` | Ручное тестирование изменений ветки: анализ изменений и документов задачи, тест-план (пишется и сохраняется без согласования), запуск всех приложений проекта, тесты (`curl`, Playwright, веб-версия Max), остановка запущенного и отчёт через Plannotator; проектные настройки читаются из блока `testing` в `.claude/dev-conventions.json` |
| `plugins/kit/skills/codex-implement` | Отдаёт реализацию утверждённого плана одной долгой сессии Codex (workspace-write, без git): Claude берёт на себя установки и red/green-проверки через handoff, затем финальные проверка и ревью. Бэкенд выбирается профилем (`codex` по умолчанию или `local` — своя OpenAI-совместимая модель; оба профиля `setup.sh` и `update-ai-dev-kit` прописывают в `.claude/dev-conventions.json` сами, секретов там нет — только имя переменной `LOCAL_LLM_API_KEY`) в блоке `codex` в `.claude/dev-conventions.json` (общем с `doc-review`) |
| `plugins/kit/skills/doc-review` | Автоматический цикл ревью документов (дизайн или план) через Codex: Codex только читает и пишет отчёт, правки вносит Claude, цикл идёт до вердикта `NO_MAJOR_ISSUES`. Модель выбирается тем же блоком `codex` (профиль роли `review`), поэтому ревью может делать и собственная модель |
| `plugins/kit/skills/update-ai-dev-kit` | Приводит проект к актуальному состоянию кита одной командой: обновляет rules-submodule (и `AGENTS.md`, если подключён Codex), плагины кита (скиллы, моды, стековые best-practices), **включает новые**, появившиеся в репозитории |

**Правило проекта:** новый скилл — просто папка в `plugins/kit/skills/` с `SKILL.md` (`name` равен имени папки; `tests/layout.test.mjs` это проверяет). Регистрировать его нигде не нужно: он попадёт в плагин `kit` автоматически. Скиллы вызываются как `kit:<имя>`.

### Моды (`mods/`)

Плагины Claude Code с UI и хуками (TypeScript), перечислены в `.claude-plugin/marketplace.json`. `setup.sh` включает их в `.claude/settings.json` проекта (`extraKnownMarketplaces` + `enabledPlugins`), поэтому они появляются у всех, кто открывает проект и доверяет папке.

| Мод | Что делает |
|---|---|
| `mods/polish` | Кнопка `Polish` над промптом и команда `/polish`: по очереди запускает `/simplify` и `/superpowers:requesting-code-review`, ждёт всех агентов `simplify` и ревью-субагента, затем основной ассистент молча применяет находки ревью. Никаких отчётов и Plannotator — только правки. Нажатие кнопки мышью работает в полноэкранном режиме (`/tui fullscreen`), иначе — `ctrl+x`, `Tab`, `p` |
| `mods/pr-flow` | Реагирует на «сделай ПР» и git-команды: на просьбу подмешивает в промпт инструкции потока (коммит с согласованием сообщения, push, ПР через API Forgejo или `gh`), блокирует `git commit` в trunk, а перед созданием ПР (`gh pr create` или POST на `/pulls`) проверяет, что в описании есть строка `**Серьёзность: <Лёгкие/Средние/Серьёзные/Критичные>** — причина` не ниже границы, посчитанной по диффу (миграции, auth, CI, конфиги, major-зависимости и т. п.), и раздел `## Что сделано`; иначе команда блокируется с объяснением |

`setup.sh` (через `mods/install-mods.sh`) не только прописывает мод в `settings.json`, но и ставит его командой `claude plugin install polish@ai-dev-kit --scope project`: запись в `enabledPlugins` без установки мод не загружает. Установка — на каждой машине отдельно, поэтому коллегам нужно один раз запустить `setup.sh` или выполнить эту команду вручную.

Ручная установка без `setup.sh` (личная, в user-scope):

```
/plugin install polish --marketplace SatanLittleHelper/ai-dev-kit
```

**Правило проекта:** новый мод нужно дописать и в `.claude-plugin/marketplace.json`, и в массив `BASE_PLUGINS` в `setup.sh` — оба списка захардкожены. Проверки: `claude plugin validate mods/<name>`, `claude plugin validate .`, `claude plugin test mods/<name>`.

### Внешние зависимости workflow

`setup.sh` устанавливает официальные плагины **Superpowers** и **Plannotator** для Claude Code и CLI Plannotator. Общий реестр — `dependencies/plugins.json`; установка и обновление используют один скрипт:

```bash
bash .claude/ai-dev-kit/dependencies/install.sh
bash .claude/ai-dev-kit/dependencies/install.sh --update
```

Нужны Node.js, Git, Claude Code CLI и `curl` при скачивании CLI. Плагины включаются в проектном `.claude/settings.json`; существующие настройки и явные отключения (`false`) сохраняются. Каждый разработчик запускает установку на своей машине. После установки или обновления плагинов нужно перезапустить Claude Code.

Бинарник Plannotator устанавливается официальным установщиком `https://plannotator.ai/install.sh` с `--minimal`: интеграцию Claude обеспечивает проектный плагин. Другие агенты этим шагом не настраиваются. CLI должен быть доступен через `PATH` (обычно `~/.local/bin`); для проверки управляемой извне копии можно задать `AI_DEV_KIT_PLANNOTATOR_BIN` (это не меняет каталог официального установщика). Затенение установленного бинарника другой копией в `PATH` считается ошибкой. Plannotator обновляется по собственному циклу: `--update` не трогает ни его маркетплейс (репозиторий около 400 МБ, клонируется заново при каждом обновлении), ни плагин, ни бинарник — кит только следит, чтобы он был установлен.

`update-ai-dev-kit` вызывает этот скрипт с `--update` после обновления submodule. Ошибки не подавляются: установщик возвращает ненулевой код, и обновление должно явно сообщить о незавершённом шаге.

Если нужный плагин, мод (`pr-flow`, `polish`), скилл или CLI недоступен, агент называет зависимость, объясняет, какой шаг от неё зависит, и предлагает конкретную команду установки. Независимую работу можно продолжать; зависимый шаг ждёт установки либо явного решения пользователя обойтись без неё. Запись `enabledPlugins` сама по себе не доказывает, что мод загрузился.

**Codex подключается отдельно.** Генерация `AGENTS.md` переносит правила, но не устанавливает плагины Claude Code в Codex. Для Superpowers используется каталог плагинов Codex; полный официальный установщик Plannotator настраивает поддерживаемые интеграции обнаруженных агентов. См. [Superpowers](https://github.com/obra/superpowers) и [Plannotator](https://github.com/backnotprop/plannotator). Codex получает свой плагин `pr-flow` вместе с `kit`. После установки откройте новую сессию и используйте «сделай ПР». Для проверки нужен Node.js 24+. Через `/hooks` можно доверить хуки плагина. После изменения хука Codex может попросить подтвердить доверие повторно. Хуки проверяют распознанные вызовы оболочки в локальном Codex. Навык запускает проверку нового PR и без доверенного хука. `polish` требует Claude Code.

Проверка установщика без сетевых запросов и изменений пользовательских настроек: `node --test dependencies/install.test.cjs`.

### Значения по умолчанию для `.claude/dev-conventions.json` (`defaults/`)

`setup.sh` и `update-ai-dev-kit` запускают `bash .claude/ai-dev-kit/defaults/install-dev-conventions.sh`: он дописывает в `.claude/dev-conventions.json` значения кита из `defaults/dev-conventions.defaults.json`. Сейчас это профили бэкенда Codex: `codex` (как сейчас) и `local` (твоя OpenAI-совместимая модель: модель, ссылка, токен). Кит не знает твой сервер, поэтому в `local` лежат плейсхолдеры `YOUR-MODEL` и `https://YOUR-HOST/v1` — их надо заменить в проекте; пока они на месте, профиль считается ненастроенным и в выбор не попадает. Сервер должен поддерживать Responses API (`/responses`) — «OpenAI-совместимый» этого не гарантирует, проверка — в `skills/codex-implement/SKILL.md`, раздел «Checking your server». Добавляются только отсутствующие ключи, существующие значения проекта не перезаписываются. **Секретов в файле нет**: профиль называет только переменную окружения `LOCAL_LLM_API_KEY`, токен каждый разработчик экспортирует в своём шелле сам. Профиль выбирают скиллы `doc-review` и `codex-implement`; какой использовать по умолчанию для каждого — задают `codex.review.profile` / `codex.implement.profile`.

Проверка: `node --test defaults/merge-dev-conventions.test.cjs`.

### Правила (`rules/`)

Не скиллы — обычные markdown-файлы, организованы иерархически по тому же принципу, что личный конвенций-набор в `chatbot-platform` (`.claude/rules/{base,angular,nest,skills}`):

```
rules/
  RULES.md          # always-on агрегатор — единственная точка @import для проекта
  core.md           # компактные always-on guardrails
  orchestrator.md   # роутинг-таблица: что читать/вызывать для текущей ситуации
  base/             # универсальные правила + подробные on-demand правила
  skills/           # always-on/on-demand слой поверх superpowers:X / workflow
  angular/            # Angular-конвенции, по темам, on-demand
  nestjs/             # NestJS-конвенции, по темам, on-demand
```

**`rules/base/`** — универсальные правила и подробные on-demand правила:

| Файл | Что внутри |
|---|---|
| `naming.md` | Именование интерфейсов/типов, порядок полей, non-null assertion |
| `class-structure.md` | Порядок членов класса, деструктуризация 3+ параметров |
| `file-structure.md` | Когда выносить в `*.types.ts`/`*.constants.ts`/`*.helpers.ts`/`*.mapper.ts`, барели |
| `workflow-and-misc.md` | `let`+переприсваивание, magic numbers, язык документации (rules — English, docs — русский) |
| `testing.md` | **on-demand**: что покрывать тестами, стиль ассертов, tautology check |
| `test-execution-policy.md` | **on-demand**: TDD по умолчанию — кто и когда пишет тесты |
| `mcp-tool-priority.md` | **on-demand**: когда предпочитать выделенный MCP-инструмент простому Bash |
| `git-and-commits.md` | **on-demand**: ветки, коммиты, формат сообщения, тикет-префикс |
| `local-vs-shared.md` | on-demand. `*.local.md` vs обычный `*.md` |
| `artifacts-and-tmp.md` | on-demand. Куда класть планы/спеки/отчёты/логи |

**`rules/skills/`** — личный слой поверх стороннего workflow (`superpowers:X` или Plannotator):

| Файл | Группа | Что внутри |
|---|---|---|
| `brainstorming.md` | on-demand | Обёртка над `superpowers:brainstorming`: согласование через Plannotator без Plan Mode, триггер-фразы, куда сохранять дизайн-документ |
| `writing-test-plans.md` | on-demand | Этап A двухэтапного планирования: план тестов (что и зачем проверяет каждый тест, поведением и без кода; порядок unit → integration → e2e), валидация через скилл `doc-review` (`--type=test-plan`, Codex, максимум 3 итерации) до показа пользователю; пропускается, если нет тестируемых слоёв |
| `writing-plans.md` | on-demand | Этап B: обёртка над `superpowers:writing-plans`: детект стека → какие `rules/angular\|nestjs` подгрузить перед написанием плана; код тестов и реализация привязаны к тест-ID из плана тестов; черновик плана до показа пользователю валидируется через `doc-review --type=plan` (максимум 3 итерации) |
| `verification-before-completion.md` | on-demand | Требования к отчёту о проверке работы перед тем, как считать задачу выполненной |
| `executing-plans.md` | on-demand | Дисциплина исполнения уже написанного плана |
| `subagent-driven-development.md` | on-demand | Как делегировать задачи плана субагентам |
| `document-approval.md` | on-demand | Согласование документов (спека, план тестов, план, роадмап, черновик задачи) через Plannotator без native Plan Mode: черновик в `tmp/drafts/`, `plannotator annotate --gate --json` с историей версий, сохранение только после `approved` |
| `plannotator.md` | on-demand | Как вести себя вокруг долгоживущего процесса ревью в Plannotator |

**`rules/angular/`** и **`rules/nestjs/`** — on-demand, по одному файлу на тему (`di.md`, `component.md`, `repository.md`, `dto.md` и т.д.). Каждая директория начинается с `index.md` — краткая карта («какой файл про что»), не заменяет чтение конкретного файла и **не** является `@import`-агрегатором (см. ниже).

On-demand файлы отдельно импортировать не нужно — `rules/core.md` и `rules/orchestrator.md` (always-on) содержат обязательные guardrails и указывают, какой файл прочитать в конкретной ситуации.

**Важно про `@import` и `index.md`:** `@import` резолвится только внутри always-on цепочки, начинающейся от `rules/RULES.md` (то есть при первой загрузке CLAUDE.md проекта). Файл, до которого агент доходит через `Read` посреди сессии (это все on-demand файлы — `rules/angular/*`, `rules/nestjs/*`, `rules/skills/executing-plans.md` и т.д.), не разворачивает `@`-ссылки внутри себя — они останутся как обычный текст. Поэтому `angular/index.md`/`nestjs/index.md` — это таблица-подсказка «что где», а не `@import`-агрегатор: агент должен явно `Read` нужный файл темы по пути, а не рассчитывать, что чтение `index.md` подтянет остальное.

### Внешние зависимости: best-practices плагины

`rules/nestjs/index.md` и `rules/angular/index.md` начинаются с «REQUIRED SUB-SKILL: invoke `nestjs-best-practices:nestjs-best-practices`/`angular-best-practices:angular-best-practices` первым» — это скиллы внешних плагинов. Они подключены записями-ссылками в `.claude-plugin/marketplace.json` и `.agents/plugins/marketplace.json` (репозитории авторов без лицензии, поэтому не копируются в кит; закреплены по полному `sha`, обновление `sha` — осознанное изменение в ките). `setup.sh` включает их автоматически при обнаружении соответствующего стека; вручную:

```bash
bash .claude/ai-dev-kit/mods/install-mods.sh angular-best-practices   # или nestjs-best-practices
```

Если зависимость отсутствует, агент сообщает об этом и предлагает установку по `rules/base/workflow-dependencies.md`; без неё `rules/angular/`/`rules/nestjs/` реально дают только личный, более узкий слой конвенций, без базового общефреймворкового пласта, который эти best-practices скиллы должны были закрыть.

### Codex: `AGENTS.md` — отдельный механизм, не `@import`

`CLAUDE.md`'s `@import` — фича Claude Code; Codex её не поддерживает так же надёжно. Проверено эмпирически: Codex прочитал `@путь.md`-строку в `AGENTS.md` как обычный текст и подтянул содержимое только потому, что модель сама, по собственной инициативе, решила дополнительно прочитать файл — не потому, что `AGENTS.md` при загрузке разворачивает `@`-ссылки. На одной короткой ссылке модель угадывает; полагаться на это для always-on файлов `rules/RULES.md` ненадёжно.

Для Claude Code критические действия получают короткий always-on guardrail в `rules/core.md`, который требует прочитать подробное правило непосредственно перед действием. Это сохраняет строгую точку остановки при существенно меньшем постоянном контексте.

Поэтому для Codex — не копия `@import`-строк, а **генерируемый плоский блок**: `rules/build-agents-md.sh` инлайнит реальное содержимое всей always-on цепочки в маркированный блок внутри `AGENTS.md` проекта (`<!-- ai-dev-kit:rules:start -->` … `<!-- ai-dev-kit:rules:end -->`), не трогая остальное содержимое файла. Идемпотентно — повторный запуск просто заменяет блок.

После общих правил генератор добавляет адаптации из `rules/codex.md`. Они задают для Codex согласование спецификаций и планов в Plannotator с историей версий и диффом между правками, без обязательного переключения native Plan Mode. Этот файл не входит в импорты `rules/RULES.md` для Claude Code.

```bash
bash .claude/ai-dev-kit/rules/build-agents-md.sh
```

`setup.sh` (ниже) сам спрашивает при первом запуске, нужна ли поддержка Codex — если да, вызывает этот генератор сразу. Если решишь добавить это позже — просто вызови команду выше в любой момент.

## Подключение к проекту

### Быстрый способ — одна команда

```bash
curl -fsSL https://raw.githubusercontent.com/SatanLittleHelper/ai-dev-kit/main/setup.sh | bash
```

Запускается из корня проекта (внутри git-репозитория). Делает всё, что описано выше, за один проход: добавляет этот репозиторий как submodule, дописывает `@import`-строку в `CLAUDE.md`, регистрирует хуки в `.claude/settings.json` (запрет trailer'ов в коммитах и `kit-sync` — см. ниже), убирает старые копии скиллов, установленные когда-то через `npx skills`, включает плагины кита (`kit` со скиллами, моды `polish`, `pr-flow` и — если в `package.json` есть `@angular/core`/`@nestjs/core` — соответствующий best-practices плагин) в `.claude/settings.json` проекта с `autoUpdate: true` и ставит их командой `claude plugin install … --scope project`, устанавливает официальные Superpowers и Plannotator с CLI, добавляет дефолтные профили Codex. **Спрашивает, нужна ли поддержка Codex**: если да — генерирует `AGENTS.md`, ставит плагины кита в Codex (`codex plugin marketplace add` + `codex plugin add`), включает их в `.codex/config.toml` и регистрирует хук в `.codex/hooks.json` (его нужно один раз одобрить в Codex через `/hooks`). Безопасно перезапускать: каждый шаг пропускается, если уже сделан. Ничего не коммитит — итог смотреть через `git status` и коммитить самостоятельно.

### Хук проверки кита (`kit-sync`)

SessionStart-хук `rules/hooks/kit-sync.js` лежит в submodule и регистрируется в `.claude/settings.json` (при Codex — и в `.codex/hooks.json`), поэтому работает даже тогда, когда плагин `kit` не установлен. Он только предупреждает (`systemMessage`) и ничего не меняет: submodule не инициализирован или отстаёт от `main` кита; плагины включены в проекте, но не установлены на этой машине (с точной командой установки); в `skills-lock.json` остались скиллы, которые теперь ставятся плагинами. Сетевая проверка — с таймаутом 3 с и кешем на 6 часов; без сети хук молчит.

Вопрос про Codex читается из `/dev/tty`, не из stdin (stdin в `curl | bash` занят самим скриптом) — в среде без терминала (CI и т.п.) шаг просто пропускается с подсказкой, как вызвать генератор вручную позже.

### Вручную, по частям

**Скиллы.** Поставляются плагином `kit` (`plugins/kit/skills/<name>`), вызываются как `kit:<имя>`. Claude Code: `bash .claude/ai-dev-kit/mods/install-mods.sh kit`; Codex: `bash .claude/ai-dev-kit/mods/install-codex-plugins.sh kit`.

Обновление идёт само: Claude Code проверяет marketplace после первого сообщения сессии (`autoUpdate: true`, применяется в следующей сессии или по `/reload-plugins`), Codex — при запуске. Версий нет: обновление определяется по SHA коммита. Сразу и всё вместе (включая submodule) — скилл `kit:update-ai-dev-kit` («обнови скиллы» / «обнови правила» / «обнови кит»). Записей скиллов кита в `skills-lock.json` больше нет; остатки старой установки убирает `bash .claude/ai-dev-kit/mods/migrate-legacy-skills.sh`.

**Правила.** Это не скиллы и не плагины, а обычные файлы. Подключаются через git submodule + один `@import` в CLAUDE.md проекта:

1. Добавить репозиторий как submodule:

   ```bash
   git submodule add git@github.com:SatanLittleHelper/ai-dev-kit.git .claude/ai-dev-kit
   ```

2. В проектном `CLAUDE.md` (не глобальном) добавить одну строку:

   ```
   @.claude/ai-dev-kit/rules/RULES.md
   ```

   Это рекурсивно подтянет компактный always-on-блок (`core`, `orchestrator`, `base/naming`, `base/class-structure`, `base/file-structure`, `base/workflow-and-misc`) одним импортом. Остальные правила читаются on-demand по роутеру.

3. On-demand файлы (`rules/angular/*.md`, `rules/nestjs/*.md`, `rules/base/local-vs-shared.md` и т.д.) отдельно импортировать не нужно — `rules/orchestrator.md` уже в контексте и сам укажет читать нужный по пути внутри submodule, когда придёт время (`Read .claude/ai-dev-kit/rules/nestjs/repository.md` и т.п.).

4. Обновление до последней версии репозитория:

   ```bash
   git submodule update --remote .claude/ai-dev-kit
   ```

   Если в проекте есть сгенерированный блок в `AGENTS.md` (Codex), перегенерировать его тем же шагом: `bash .claude/ai-dev-kit/rules/build-agents-md.sh` — `CLAUDE.md` ничего дополнительно делать не нужно, `@import` уже подхватывает новое содержимое сам. Скилл `update-ai-dev-kit` делает оба шага (submodule + `AGENTS.md`, если он ранее был сгенерирован) вместе со скиллами и модами одной командой.
