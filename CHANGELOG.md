# Changelog

## [Unreleased]

### Added
- Добавлен финальный frontend editable approval UAT smoke для live BFF/proxy
  режима: проверяются ephemeral auth, `current_editable`, 37 map features,
  13 profile metrics с shortwave, approval POST/readback и негативные CSRF/scope
  сценарии без записи секретов в отчёты.
- Добавлен pre-UAT same-origin browser/proxy smoke для проверки, что frontend
  origin обслуживает SPA и проксирует `/api/*` в backend JSON/API, а не в
  `index.html`.
- Добавлен ephemeral auth mode для frontend API v2 SP37 live-smoke: при
  отсутствии внешних smoke credentials runner создаёт временного backend
  пользователя через существующий bootstrap helper, проходит обычный
  CSRF/login/session flow и затем отзывает сессии и деактивирует пользователя
  без записи пароля в отчёты.
- Добавлен frontend API v2 SP37 live-smoke runner для проверки опубликованного
  `currentAppliedCalculationRunId`, 37 map features и 13 profile metrics без
  вывода cookies, CSRF token или пароля в отчёты.
- Добавлена dependency-free проверка покрытия profile metrics, блокирующая
  потерю backend metric `shortwave_radiation_daily_mj_m2` в графике или CSV.
- Добавлен свежий baseline-аудит frontend-кодовой базы KORNIX с машинно-читаемыми
  отчётами в `codex_reports/` и ссылками на текущий security/documentation
  статус в README.

### Changed
- Таблица ввода поливов теперь блокирует редактирование при любом состоянии,
  кроме `frontendMode=current_editable` и `submitAllowed=true`, чтобы UI не
  оставлял активные поля при backend-issued запрете submit.
- Frontend API client теперь явно передаёт `seasonYear` в поддерживающие API v2
  endpoints `current-context`, `readiness/current`, `irrigation-layer/current`
  и `field-seasons/catalog`, чтобы URL/state сезона не зависел от backend
  default.
- Legacy `/api/v1/kornix/*` документы помечены как archived/deprecated; текущий
  UAT/production contract для расчётных данных — `/api/v2/kornix/*`.
- График водного режима теперь потребляет и экспортирует солнечную радиацию
  `shortwave_radiation_daily_mj_m2` (`МДж/м²/сутки`) как отдельную линию в
  weather-зоне, чтобы backend SP37 profile response из 13 метрик не сжимался до
  12 видимых/exported метрик.
- Frontend calculation-run status helper переведён на production route
  `/api/v2/kornix/water-regime/calculation-runs/{calculationRunId}`; старый
  `/api/v2/kornix/calculation-runs/{calculationRunId}/status` удалён из
  runtime-кода и README-контракта.
- Frontend подготовлен к VDS production security: production API base теперь
  документирован и проверяется как `/api`, добавлены `Dockerfile.prod`,
  `docker-compose.prod.yml`, `.env.local.example` и `.env.production.example`.
- BFF login UX переведён с redirect-сценария на форму `username/password` с
  `POST /api/v1/auth/login`, последующим refetch `/api/v1/me` и сохранением
  запрета на хранение токенов в browser storage.
- Production Nginx CSP ужесточён: удалены localhost API origins из `connect-src`,
  оставлены security headers и задокументирована причина временного
  `style-src 'unsafe-inline'`.
- CSRF handling для unsafe API-запросов теперь выполняет один безопасный
  refresh/retry при backend code `CSRF_TOKEN_INVALID`.
- Добавлена обязательная frontend security documentation в `doc/security/` и
  расширен contract-check для VDS security readiness.
- Локальный integration-dev профиль сохраняет `VITE_API_BASE_URL=http://localhost:8001`,
  но в Docker/Vite dev-режиме проксирует same-origin `/api/*` к backend через
  `host.docker.internal:8001`, чтобы frontend smoke не зависел от CORS.
- Approval submit для API v2 больше не отправляет backend-only metadata
  `managedScope.scopeHash`; payload нормализуется до строгих полей
  `dateFrom`, `dateTo`, `fieldSeasonIds`, `scopeVersion`.
- Ввод поливов для API v2 теперь загружает backend active projection через
  `/api/v2/kornix/irrigation-layer/current`, использует его как начальное
  состояние таблицы и считает `clientDiff` от backend projection, а не от
  локальной отметки утверждения.
- Editable range таблицы поливов ограничен backend-issued `managedScope`
  (`dateFrom..dateTo` и список `fieldSeasonIds`); значения вне scope
  блокируются и не могут попасть в approval submit.
- Contract-check дополнительно запрещает `/api/admin/v1`, `/admin` leakage и
  локальную `approvedSignature`-семантику для утверждённых поливов.
- Пользовательский workspace KORNIX переведён с legacy `/api/v1/kornix` на
  контракт `/api/v2/kornix`, при этом auth/me и CSRF остаются на `/api/v1`.
- Отображаемый расчёт теперь определяется `currentAppliedCalculationRunId` из
  backend current-context; старое предположение про `latestCalculationRunId`
  удалено из рабочего flow.
- Добавлен выбор метода расчёта из `availableMethods`; map/profile запрашивают
  данные с выбранным `methodCode`, а URL хранит только валидный выбранный метод.
- Утверждение поливов переведено на approval workflow: frontend отправляет
  `managedScope`, положительный `irrigationLayer`, `clientDiff` и обрабатывает
  polling статуса approval без переключения на failed расчёт.
- `stale_read_only` и `not_ready` режимы current-context блокируют отправку и
  редактирование поливов, но не трактуются как ошибка авторизации.
- Интеграционный env-профиль явно фиксирует `VITE_KORNIX_API_VERSION=v2` и
  описывает разделение `/api/v1` auth endpoints и `/api/v2/kornix` расчётов.
- В validate-проверку добавлен contract-check, который блокирует возврат
  legacy `/api/v1/kornix`, `latestCalculationRunId`, старого calculate-flow и
  `irrigation_tasks` в рабочем `src`.
- Mock `calculationRunId` на рабочей странице теперь подчиняется той же
  runtime-защите, что mock API/auth, и не подставляется вне разрешённых
  локальных host.
- BFF auth больше не маскирует сетевые ошибки `/api/v1/me` под гостевую
  сессию: реальные ошибки backend показываются как сбой проверки авторизации.
- Календарная арифметика карты, графика и ввода поливов переведена на
  timezone-neutral ISO-дни, чтобы не зависеть от локальной зоны браузера.
- Шаговые стрелки ввода полива больше не создают значение `0`: нижняя граница
  после пустого значения — `1` мм.
- Черновики и признак утверждения поливов в `localStorage` теперь разделены по
  пользователю и организации, а не только по году сезона.
- Unsafe API-запросы получают CSRF token через `/api/v1/auth/csrf`, если token
  отсутствует в cookie/meta перед `POST`, `PUT`, `PATCH` или `DELETE`.
- HTTP-клиент разбирает backend error envelope и сохраняет `code`, `message`,
  `details`, `requestId` в `ApiError` для понятного отображения в UI.
- Catalog-flow первого расчёта разделён с расчётными map/profile: каталог
  используется для таблицы поливов, а карта и график требуют `calculationRunId`.
- API-adapter нормализует legacy camelCase рекомендации backend в snake_case
  frontend DTO.
- Tooltip и форматирование площади устойчивее к пропускам `fieldName`,
  `areaHa` и блока `dataQuality`.
- TypeScript-контракт API v1 ужесточён: даты profile-timeseries обязательны,
  `areaHa` в map properties допускает `null`, а `FieldDataQualityDto` принимает
  дополнительные поля источника данных.
- URL parser больше не принимает служебный `calculationRunId=catalog`, чтобы
  placeholder каталога не уходил в backend map/profile endpoints.
- Добавлен `.env.integration.example` для backend smoke без mock API.
- Submit поливов считает `calculationStatus=failed` ошибкой: не утверждает
  сценарий, не переключает URL и показывает `calculationRunId`/warning codes.
- Backend warnings по расчёту, карте и profile-timeseries отображаются как
  диагностические предупреждения без блокировки успешного сценария.
- Служебный `calculationRunId=catalog` игнорируется не только из URL, но и из
  текущего backend context, чтобы map/profile не запрашивались с placeholder id.
- Добавлен `make integration-dev` для запуска frontend против локального backend
  API через `.env.integration.example` без mock-режима.
- Обновлён frontend-контракт до API v1.1: добавлены даты backend
  `serverDate`, `forecastStartDate`, `forecastEndDate`, каталог полей до
  первого расчёта и поддержка пустого сценария `irrigation_tasks`.
- Исправлена AWC-семантика: `available_water_content_mm` теперь означает
  `НВ − ВЗ`, а текущий доступный запас воды хранится отдельно как
  `current_available_water_mm`.
- График растений переименовывает `crop_transpiration_daily_mm` в суточную
  транспирацию культуры, без старой подписи про фактическое суммарное испарение.
- Синхронный запрос расчёта водного режима получил отдельный timeout 120 секунд
  с возможностью настройки через `VITE_KORNIX_CALCULATION_TIMEOUT_MS`.
- CSV-экспорт графика теперь пишет дневное значение
  `soil_total_capacity_water_mm`, а не общий максимум для оси.
- Адаптирован frontend KORNIX под контракт API v1.0: групповой `calculationRunId`,
  `current-context`, `calculate`, map и profile-timeseries endpoints.
- Заменены старые коды метрик на v1.0 `long_name_for_code` и добавлены derived
  расчёты доступных влагозапасов на стороне frontend.
- Ввод поливов теперь отправляет сценарий `irrigation_tasks` на расчёт водного
  режима, не создавая локальных фактов полива.
- График водного режима переведён на общую числовую ось времени и получил
  компактный диапазонный зум вместо неработающего нижнего ползунка.
- Уточнена адаптивная компоновка графика: четыре блока и зум-полоска остаются
  в единой вертикальной стопке с общей хронологической шкалой, а боковые панели
  выбора полей и сервисных действий сохранены.
- Нижняя лента диапазона графика очищена от старых кнопок навигации и
  синхронизирована с календарными полями видимого периода.
- Отсечка прогноза на нижней ленте теперь рассчитывается внутри видимого
  диапазона и совпадает с отсечкой прогноза на графиках.
- Календарные поля видимого периода в правой панели сохранены как date-picker,
  но отображаются в компактном формате `DD.MM.YY`.
- Компактные календарные поля теперь открывают рабочую календарную сетку по
  клику по всей плашке, а не только визуально имитируют date-picker.
- Правый календарь диапазона раскрывается влево от поля окончания периода, не
  упираясь в край боковой панели.
- Правая панель карты уплотнена на узкой ширине, чтобы легенда и режимы
  отображения не выпадали ниже видимой области.
- На вкладке ввода поливов добавлен чекбокс показа легенды глубины полива.
- CSV-экспорт защищён от formula injection: значения с формульными префиксами
  выгружаются как текстовые ячейки.
- Подписи нижней шкалы диапазона графика переведены в отдельные адаптивные
  метки дат формата `DD.MM.YY` без текстового диапазона.
- Разделены роли подписей на ленте графика: верхние метки показывают границы
  текущего зума, нижняя строка стала неподвижной адаптивной шкалой времени.
- Метки границ зума перенесены внутрь зелёной ленты, чтобы даты не уходили за
  край графического блока.
- В правой панели графика для одиночного выбранного поля отображается его
  название вместо технической подписи «одно поле».
- Из пользовательской правой панели графика убраны технические предупреждения
  mock-агрегации и неполного покрытия расчётов.
- Упрощены подписи во всплывающих подсказках графика: влагозапасы и суммы
  температур округляются до целых значений, диапазон доступных влагозапасов
  показывается как положительная разность.

### Technical
- Добавлена документация `docs/kornix-frontend-api-v1.md` с фронтенд-частью
  финального API-контракта.
