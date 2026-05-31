# KORNIX Frontend API v1.1

Документ фиксирует контракт, под который адаптирован сайт KORNIX. Backend остаётся
единственной границей доступа к данным: frontend не читает БД, KML, Open-Meteo,
Python-модули расчёта и не передаёт `organizationId` или `organizationCode` как
доверенный tenant-фильтр.

## Рабочий сценарий

1. `GET /api/v1/me` возвращает текущего пользователя и организацию.
2. `GET /api/v1/kornix/current-context` возвращает сезонный контекст и последний
   групповой `calculationRunId`, а также даты `serverDate`, `forecastStartDate`
   и `forecastEndDate` в timezone `Europe/Moscow`.
3. `POST /api/v1/kornix/water-regime/calculate` принимает только сценарий
   пользовательских задач полива и возвращает новый или переиспользованный
   групповой `calculationRunId`.
4. `GET /api/v1/kornix/field-seasons/map?calculationRunId=<id>&day=YYYY-MM-DD`
   возвращает GeoJSON карты строго в рамках расчётной группы.
5. `GET /api/v1/kornix/water-regime/profile-timeseries?calculationRunId=<id>&fieldSeasonIds=<ids>&aggregation=area_weighted_mean`
   возвращает профиль временных рядов по расчётному окну группы.

Если backend ещё не имеет `latestCalculationRunId`, frontend загружает каталог
орошаемых полей для первого пользовательского расчёта:

```http
GET /api/v1/kornix/field-seasons/catalog?seasonYear=2026
```

Минимальный каталог должен вернуть `fieldSeasonId`, номер/название поля,
площадь, культуру, дату сева, коэффициенты `koef_*` и, по возможности, геометрию.
Если геометрии нет, таблица ввода поливов остаётся рабочей, но карта не сможет
полноценно отобразить поле до расчёта.

`calculationRunId` в публичном API является групповым идентификатором сценария
и набора полевых расчётов. Внутренние `water_balance_runs.calculation_run_id`
остаются backend-деталью.

## Поливы

Frontend отправляет только `irrigation_tasks`:

```ts
type IrrigationTaskDto = {
  fieldSeasonId: string;
  irrigationDate: string;
  irrigationTaskMm: number;
};

type IrrigationTaskPayloadDto = {
  generatedAt: string;
  irrigation_tasks: IrrigationTaskDto[];
};
```

Отсутствующая ячейка календаря не отправляется. `null` и отсутствие значения не
равны `0`; нулевые поливы frontend не создаёт как пользовательскую задачу.
Рекомендации backend не становятся задачами полива и не считаются фактом.

## Метрики v1.0

Все временные ряды используют `long_name_for_code`:

- `air_temperature_daily_c`
- `relative_humidity_daily_pct`
- `wind_daily_mps`
- `eto_daily_mm`
- `shortwave_radiation_daily_mj_m2`
- `soil_total_capacity_water_mm`
- `soil_field_capacity_water_mm`
- `soil_wilting_point_capacity_water_mm`
- `soil_water_content_mm`
- `positive_temperature_sum_from_sowing_c`
- `crop_transpiration_daily_mm`
- `precipitation_effective_daily_mm`
- `irrigation_effective_daily_mm`

Старые v0.2 коды не должны возвращаться v1.0 endpoints по умолчанию.

## Derived frontend values

Frontend выводит часть удобных показателей из backend-метрик:

- `available_water_content_mm = soil_field_capacity_water_mm - soil_wilting_point_capacity_water_mm`;
- `current_available_water_mm = soil_water_content_mm - soil_wilting_point_capacity_water_mm`;
- `available_water_fraction_pct = current_available_water_mm / available_water_content_mm * 100`;
- линии управления влагозапасами считаются по коэффициентам `koef_upper_limit`,
  `koef_optimum`, `koef_lower_limit`, полученным из map DTO выбранных полей.

Коэффициенты не зашиваются во frontend. Если backend не возвращает коэффициенты,
линии управления не должны подменяться магическими значениями.

## Обработка данных

- `null` означает отсутствие данных, неприменимость или ошибку расчёта.
- `0` означает подтверждённое нулевое значение.
- Агрегация по нескольким полям выполняется backend как `area_weighted_mean`;
  frontend отображает `coverage`, предупреждения и не дозаполняет пропуски нулями.
- `calculationRunId` обязателен для карты и профиля графиков.
- Таблица ввода поливов может отправить пустой `irrigation_tasks: []`, чтобы
  запустить первый базовый расчёт без пользовательских поливов.
