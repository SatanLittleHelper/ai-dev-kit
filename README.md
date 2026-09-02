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
| `skills/update-project-skills` | Обновляет установленные в проекте скиллы этого репозитория до последней версии (`npx skills update`) |

### Правила (`rules/`)

Не скиллы — обычные markdown-файлы, организованы иерархически по тому же принципу, что личный конвенций-набор в `chatbot-platform` (`.claude/rules/{base,angular,nest,skills}`):

```
rules/
  RULES.md          # always-on агрегатор — единственная точка @import для проекта
  orchestrator.md    # роутинг-таблица: что читать/вызывать для текущей ситуации
  base/               # кросс-стековые правила, в основном always-on
  skills/             # личный слой поверх superpowers:X / внешнего workflow-инструмента
  angular/            # Angular-конвенции, по темам, on-demand
  nestjs/             # NestJS-конвенции, по темам, on-demand
```

**`rules/base/`** — always-on, если не указано иное:

| Файл | Что внутри |
|---|---|
| `naming.md` | Именование интерфейсов/типов, порядок полей, non-null assertion |
| `class-structure.md` | Порядок членов класса, деструктуризация 3+ параметров |
| `file-structure.md` | Когда выносить в `*.types.ts`/`*.constants.ts`/`*.helpers.ts`/`*.mapper.ts`, барели |
| `workflow-and-misc.md` | `let`+переприсваивание, magic numbers, язык документации (rules — English, docs — русский) |
| `testing.md` | Что покрывать тестами, стиль ассертов, tautology check |
| `test-execution-policy.md` | TDD по умолчанию — кто и когда пишет тесты |
| `mcp-tool-priority.md` | Когда предпочитать выделенный MCP-инструмент простому Bash |
| `git-and-commits.md` | on-demand. Ветки, коммиты, формат сообщения, тикет-префикс |
| `local-vs-shared.md` | on-demand. `*.local.md` vs обычный `*.md` |
| `artifacts-and-tmp.md` | on-demand. Куда класть планы/спеки/отчёты/логи |

**`rules/skills/`** — личный слой поверх стороннего workflow (`superpowers:X` или Plannotator):

| Файл | Группа | Что внутри |
|---|---|---|
| `brainstorming.md` | always-on | Обёртка над `superpowers:brainstorming`: Plan Mode wiring, триггер-фразы, куда сохранять дизайн-документ |
| `writing-plans.md` | always-on | Обёртка над `superpowers:writing-plans`: детект стека → какие `rules/angular\|nestjs` подгрузить перед написанием плана |
| `verification-before-completion.md` | always-on | Требования к отчёту о проверке работы перед тем, как считать задачу выполненной |
| `executing-plans.md` | on-demand | Дисциплина исполнения уже написанного плана |
| `subagent-driven-development.md` | on-demand | Как делегировать задачи плана субагентам |
| `plannotator.md` | on-demand | Как вести себя вокруг долгоживущего процесса ревью в Plannotator |

**`rules/angular/`** и **`rules/nestjs/`** — on-demand, по одному файлу на тему (`di.md`, `component.md`, `repository.md`, `dto.md` и т.д.). Каждая директория начинается с `index.md` — краткая карта («какой файл про что»), не заменяет чтение конкретного файла и **не** является `@import`-агрегатором (см. ниже).

On-demand файлы отдельно импортировать не нужно — `rules/orchestrator.md` (always-on) содержит таблицу маршрутизации и указывает, какой файл читать в конкретной ситуации.

**Важно про `@import` и `index.md`:** `@import` резолвится только внутри always-on цепочки, начинающейся от `rules/RULES.md` (то есть при первой загрузке CLAUDE.md проекта). Файл, до которого агент доходит через `Read` посреди сессии (это все on-demand файлы — `rules/angular/*`, `rules/nestjs/*`, `rules/skills/executing-plans.md` и т.д.), не разворачивает `@`-ссылки внутри себя — они останутся как обычный текст. Поэтому `angular/index.md`/`nestjs/index.md` — это таблица-подсказка «что где», а не `@import`-агрегатор: агент должен явно `Read` нужный файл темы по пути, а не рассчитывать, что чтение `index.md` подтянет остальное.

### Внешние зависимости: best-practices скиллы

`rules/nestjs/index.md` и `rules/angular/index.md` начинаются с «REQUIRED SUB-SKILL: invoke `nestjs-best-practices`/`angular-best-practices` первым» — это не наши скиллы, они не входят в этот репозиторий и не ставятся вместе с ним. Без них личные конвенции применяются поверх пустоты: правило говорит «сначала вызови X», а X в проекте не установлен. Ставить их в проект отдельно:

```bash
npx skills add alfredoperez/angular-best-practices --skill angular-best-practices
npx skills add kadajett/agent-nestjs-skills --skill nestjs-best-practices
```

Без установки эти правила не откажут — по `rules/orchestrator.md` отсутствующий скилл просто пропускается молча, — но тогда `rules/angular/`/`rules/nestjs/` реально дают только личный, более узкий слой конвенций, без базового общефреймворкового пласта, который эти best-practices скиллы должны были закрыть.

## Подключение к проекту

### Скиллы

Не меняется по механике, но путь внутри репозитория теперь `skills/<name>` — при установке конкретного скилла указывай подпапку:

```bash
npx skills add SatanLittleHelper/ai-dev-kit --skill skills/roadmap
```

Обновление — `npx skills update` (или скилл `update-project-skills`, если уже подключён), пин версий в `skills-lock.json` проекта.

### Правила

`npx skills` их не обрабатывает — это не скиллы, а обычные файлы. Подключаются через git submodule + один `@import` в CLAUDE.md проекта:

1. Добавить репозиторий как submodule:

   ```bash
   git submodule add git@github.com:SatanLittleHelper/ai-dev-kit.git .claude/ai-dev-kit
   ```

2. В проектном `CLAUDE.md` (не глобальном) добавить одну строку:

   ```
   @.claude/ai-dev-kit/rules/RULES.md
   ```

   Это рекурсивно подтянет весь always-on-блок (`orchestrator`, `skills/brainstorming`, `skills/writing-plans`, `skills/verification-before-completion`, `base/naming`, `base/class-structure`, `base/file-structure`, `base/workflow-and-misc`, `base/testing`, `base/test-execution-policy`, `base/mcp-tool-priority`) одним импортом.

3. On-demand файлы (`rules/angular/*.md`, `rules/nestjs/*.md`, `rules/base/git-and-commits.md` и т.д.) отдельно импортировать не нужно — `rules/orchestrator.md` уже в контексте и сам укажет читать нужный по пути внутри submodule, когда придёт время (`Read .claude/ai-dev-kit/rules/nestjs/repository.md` и т.п.).

4. Обновление до последней версии репозитория:

   ```bash
   git submodule update --remote .claude/ai-dev-kit
   ```
