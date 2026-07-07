# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Currency conversion to fold one currency's balance into another, with exchange rates auto-suggested by a provider (Frankfurter by default) and overridable manually.
- Internationalization (i18n) with English and Polish translations; additional languages are lazy-loaded.
- App info page in settings.

### Changed
- Unified navigation pattern shared between the user and admin settings pages.

### Fixed
- Correctly detect whether any users already exist during first-run setup.
- Assorted UI fixes.

## [0.2.0] - 2026-06-08

### Added
- Splitwise and ihatemoney importer for migrating existing projects.
- Basic admin panel.
- Group archiving, pinning, and a per-group statistics page.
- Math expression support in the amount input (e.g. `2 + 3.50`).
- End-to-end and frontend component test suites.

### Changed
- Image storage moved to the filesystem; uploads are converted to WebP, auto-rotated from EXIF orientation, and stored at higher quality.
- Session duration is now configurable.
- Frontend folder structure reorganized; removed Radix UI and cmdk dependencies.

### Fixed
- Settlement suggestions now update correctly.
- Admins can archive and unarchive groups.
- Group list refetches on cache miss.
- Assorted mobile and layout fixes.

## [0.1.0] - 2026-01-28

Initial release.
