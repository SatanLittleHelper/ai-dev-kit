# ai-dev-kit

Личный репозиторий dev-конвенций для работы с ИИ-агентом (Claude Code): часть контента — скиллы (в `skills/`, обнаруживаются штатным механизмом Claude Code), часть — плоские файлы правил (`rules/`), не скиллы, подключаемые через `@import` в CLAUDE.md проекта.

## Состав репозитория

### Скиллы (`skills/`)

Каждый — папка с `SKILL.md` (описание триггера + логика/процесс с ветвлением):

| Скилл | Что делает |
|---|---|
| `skills/roadmap` | Всё, что касается роадмапов — создание, продолжение, взятие чекпоинта, пакетная валидация шагов (см. `skills/roadmap/SKILL.md` и `skills/roadmap/references/`) |
| `skills/codebase-domain-map` | Генерирует и поддерживает снэпшот «что где лежит» в незнакомом/большом репозитории |
| `skills/scaffolding-nestjs-app` | Скаффолдинг нового NestJS-приложения по личным конвенциям |
| `skills/writing-prd` | Шаблон и правила оформления PRD |
| `skills/testing-changes` | Ручное тестирование изменений ветки: анализ изменений и документов задачи, тест-план (согласуется через Plan Mode), запуск всех приложений проекта, тесты (`curl`, Playwright, веб-версия Max), остановка запущенного и отчёт через Plannotator; проектные настройки читаются из блока `testing` в `.claude/dev-conventions.json` |
| `skills/update-project-skills` | Обновляет установленные в проекте скиллы этого репозитория до последней версии (`npx skills update`) |
| `skills/update-project-rules` | Обновляет rules-submodule (`git submodule update --remote`) и, если проект подключил Codex, перегенерирует `AGENTS.md` — отдельно от скиллов, намеренно не объединено с `update-project-skills` |

**Правило проекта:** при добавлении нового скилла в `skills/` — обязательно дописать его имя в массив `OUR_SKILLS` в `setup.sh`. Список там захардкожен и не подтягивается автоматически из содержимого папки: `setup.sh` устанавливает только то, что перечислено явно, так что забытый скилл просто не попадёт новым пользователям при разовой установке.

### Моды (`mods/`)

Плагины Claude Code с UI и хуками (TypeScript), перечислены в `.claude-plugin/marketplace.json`. `setup.sh` включает их в `.claude/settings.json` проекта (`extraKnownMarketplaces` + `enabledPlugins`), поэтому они появляются у всех, кто открывает проект и доверяет папке.

| Мод | Что делает |
|---|---|
| `mods/polish` | Кнопка `Polish` над промптом и команда `/polish`: по очереди запускает `/simplify` и `/code-review low`, ждёт всех агентов `simplify` и собирает общий отчёт (исправлено, пропущено, находки ревью, оценка пропусков, «рассмотрено, но не заявлено») в Plannotator; `/polish report` открывает последний отчёт. Нажатие кнопки мышью работает в полноэкранном режиме (`/tui fullscreen`), иначе — `ctrl+x`, `Tab`, `p` |

`setup.sh` (через `mods/install-mods.sh`) не только прописывает мод в `settings.json`, но и ставит его командой `claude plugin install polish@ai-dev-kit --scope project`: запись в `enabledPlugins` без установки мод не загружает. Установка — на каждой машине отдельно, поэтому коллегам нужно один раз запустить `setup.sh` или выполнить эту команду вручную.

Ручная установка без `setup.sh` (личная, в user-scope):

```
/plugin install polish --marketplace SatanLittleHelper/ai-dev-kit
```

**Правило проекта:** новый мод нужно дописать и в `.claude-plugin/marketplace.json`, и в массив `OUR_MODS` в `setup.sh` — оба списка захардкожены. Проверки: `claude plugin validate mods/<name>`, `claude plugin validate .`, `claude plugin test mods/<name>`.

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
| `brainstorming.md` | on-demand | Обёртка над `superpowers:brainstorming`: Plan Mode wiring, триггер-фразы, куда сохранять дизайн-документ |
| `writing-plans.md` | on-demand | Обёртка над `superpowers:writing-plans`: детект стека → какие `rules/angular\|nestjs` подгрузить перед написанием плана |
| `verification-before-completion.md` | on-demand | Требования к отчёту о проверке работы перед тем, как считать задачу выполненной |
| `executing-plans.md` | on-demand | Дисциплина исполнения уже написанного плана |
| `subagent-driven-development.md` | on-demand | Как делегировать задачи плана субагентам |
| `plannotator.md` | on-demand | Как вести себя вокруг долгоживущего процесса ревью в Plannotator |

**`rules/angular/`** и **`rules/nestjs/`** — on-demand, по одному файлу на тему (`di.md`, `component.md`, `repository.md`, `dto.md` и т.д.). Каждая директория начинается с `index.md` — краткая карта («какой файл про что»), не заменяет чтение конкретного файла и **не** является `@import`-агрегатором (см. ниже).

On-demand файлы отдельно импортировать не нужно — `rules/core.md` и `rules/orchestrator.md` (always-on) содержат обязательные guardrails и указывают, какой файл прочитать в конкретной ситуации.

**Важно про `@import` и `index.md`:** `@import` резолвится только внутри always-on цепочки, начинающейся от `rules/RULES.md` (то есть при первой загрузке CLAUDE.md проекта). Файл, до которого агент доходит через `Read` посреди сессии (это все on-demand файлы — `rules/angular/*`, `rules/nestjs/*`, `rules/skills/executing-plans.md` и т.д.), не разворачивает `@`-ссылки внутри себя — они останутся как обычный текст. Поэтому `angular/index.md`/`nestjs/index.md` — это таблица-подсказка «что где», а не `@import`-агрегатор: агент должен явно `Read` нужный файл темы по пути, а не рассчитывать, что чтение `index.md` подтянет остальное.

### Внешние зависимости: best-practices скиллы

`rules/nestjs/index.md` и `rules/angular/index.md` начинаются с «REQUIRED SUB-SKILL: invoke `nestjs-best-practices`/`angular-best-practices` первым» — это не наши скиллы, они не входят в этот репозиторий и не ставятся вместе с ним. Без них личные конвенции применяются поверх пустоты: правило говорит «сначала вызови X», а X в проекте не установлен. Ставить их в проект отдельно:

```bash
npx skills add alfredoperez/angular-best-practices --skill angular-best-practices
npx skills add kadajett/agent-nestjs-skills --skill nestjs-best-practices
```

Без установки эти правила не откажут — по `rules/orchestrator.md` отсутствующий скилл просто пропускается молча, — но тогда `rules/angular/`/`rules/nestjs/` реально дают только личный, более узкий слой конвенций, без базового общефреймворкового пласта, который эти best-practices скиллы должны были закрыть.

### Codex: `AGENTS.md` — отдельный механизм, не `@import`

`CLAUDE.md`'s `@import` — фича Claude Code; Codex её не поддерживает так же надёжно. Проверено эмпирически: Codex прочитал `@путь.md`-строку в `AGENTS.md` как обычный текст и подтянул содержимое только потому, что модель сама, по собственной инициативе, решила дополнительно прочитать файл — не потому, что `AGENTS.md` при загрузке разворачивает `@`-ссылки. На одной короткой ссылке модель угадывает; полагаться на это для always-on файлов `rules/RULES.md` ненадёжно.

Для Claude Code критические действия получают короткий always-on guardrail в `rules/core.md`, который требует прочитать подробное правило непосредственно перед действием. Это сохраняет строгую точку остановки при существенно меньшем постоянном контексте.

Поэтому для Codex — не копия `@import`-строк, а **генерируемый плоский блок**: `rules/build-agents-md.sh` инлайнит реальное содержимое всей always-on цепочки в маркированный блок внутри `AGENTS.md` проекта (`<!-- ai-dev-kit:rules:start -->` … `<!-- ai-dev-kit:rules:end -->`), не трогая остальное содержимое файла. Идемпотентно — повторный запуск просто заменяет блок.

```bash
bash .claude/ai-dev-kit/rules/build-agents-md.sh
```

`setup.sh` (ниже) сам спрашивает при первом запуске, нужна ли поддержка Codex — если да, вызывает этот генератор сразу. Если решишь добавить это позже — просто вызови команду выше в любой момент.

## Подключение к проекту

### Быстрый способ — одна команда

```bash
curl -fsSL https://raw.githubusercontent.com/SatanLittleHelper/ai-dev-kit/main/setup.sh | bash
```

Запускается из корня проекта (внутри git-репозитория). Делает всё, что описано выше, за один проход: ставит `skills`-CLI, если его ещё нет, добавляет этот репозиторий как submodule, дописывает `@import`-строку в `CLAUDE.md`, **спрашивает, нужна ли поддержка Codex** (и если да — генерирует `AGENTS.md`), устанавливает все наши скиллы (`skills/roadmap`, `skills/codebase-domain-map`, `skills/scaffolding-nestjs-app`, `skills/writing-prd`, `skills/update-project-skills`, `skills/update-project-rules`), включает наши моды (`mods/polish`) в `.claude/settings.json` проекта, а также — если в `package.json` проекта уже есть `@angular/core`/`@nestjs/core` — соответствующий best-practices скилл из раздела выше. Безопасно перезапускать: каждый шаг пропускается, если уже сделан. Ничего не коммитит — итог смотреть через `git status` и коммитить самостоятельно.

Вопрос про Codex читается из `/dev/tty`, не из stdin (stdin в `curl | bash` занят самим скриптом) — в среде без терминала (CI и т.п.) шаг просто пропускается с подсказкой, как вызвать генератор вручную позже.

### Вручную, по частям

**Скиллы.** Живут в `skills/<name>`, но `--skill` берёт имя скилла (значение `name:` в его `SKILL.md`, совпадает с именем папки), а не путь:

```bash
npx skills add SatanLittleHelper/ai-dev-kit --skill roadmap
```

Обновление — `npx skills update` (или скилл `update-project-skills`, если уже подключён — только скиллы, не правила), пин версий в `skills-lock.json` проекта.

**Правила.** `npx skills` их не обрабатывает — это не скиллы, а обычные файлы. Подключаются через git submodule + один `@import` в CLAUDE.md проекта:

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

   Если в проекте есть сгенерированный блок в `AGENTS.md` (Codex), перегенерировать его тем же шагом: `bash .claude/ai-dev-kit/rules/build-agents-md.sh` — `CLAUDE.md` ничего дополнительно делать не нужно, `@import` уже подхватывает новое содержимое сам. Скилл `update-project-rules` делает оба шага (submodule + `AGENTS.md`, если он ранее был сгенерирован) одной командой — отдельно от `update-project-skills`, который занимается только скиллами.
