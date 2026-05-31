# Changelog

## [Unreleased]

### Changed
- Адаптирован frontend KORNIX под контракт API v1.0: групповой `calculationRunId`,
  `current-context`, `calculate`, map и profile-timeseries endpoints.
- Заменены старые коды метрик на v1.0 `long_name_for_code` и добавлены derived
  расчёты доступных влагозапасов на стороне frontend.
- Ввод поливов теперь отправляет сценарий `irrigation_tasks` на расчёт водного
  режима, не создавая локальных фактов полива.
- График водного режима переведён на общую числовую ось времени и получил
  компактный диапазонный зум вместо неработающего нижнего ползунка.

### Technical
- Добавлена документация `docs/kornix-frontend-api-v1.md` с фронтенд-частью
  финального API-контракта.
