-- Data-only migration: no schema change.
--
-- Until this release the app ran on Node 20, whose bundled time zone data
-- (tzdata 2025c) predates four Canadian provinces/territories switching to
-- permanent daylight time (tzdata 2026b–2026e, all modelled as taking effect
-- 2026-11-01 02:00 local):
--
--   British Columbia  America/Vancouver, Canada/Pacific           -08 -> -07
--   Alberta           America/Edmonton, America/Yellowknife,
--                     Canada/Mountain                              -07 -> -06
--   NW Territories    America/Inuvik                               -07 -> -06
--   Manitoba          America/Winnipeg, Canada/Central             -06 -> -05
--
-- So every wall-clock time the server turned into UTC for those zones, for a
-- local time between 2026-11-01 02:00 and 2027-03-14 02:00 (when the old
-- rules would have sprung forward to the same offset anyway), was stored one
-- hour too late. Now that the runtime has current data, those rows would
-- show an hour later than the person entered, so they move back one hour.
--
-- One-off slots store only UTC instants, not the zone they were typed in, so
-- the owner's account time zone stands in for it — the add/edit forms
-- default to it and the calendar is drawn in it. Recurring series are stored
-- as wall-clock + zone and correct themselves; only their stored
-- first-occurrence instants (startTime/endTime) are adjusted here too.
--
-- startTime and endTime are checked separately, so a slot that only crosses
-- into the affected period has just the affected end moved. Prisma runs each
-- migration exactly once, which is what makes a one-hour shift safe to ship
-- this way: it cannot be applied twice.

WITH affected_zone ("zone", "fromUtc", "untilUtc") AS (
  VALUES
    -- Bounds are 02:00 local under the OLD standard offset, as UTC instants.
    ('America/Vancouver',   TIMESTAMPTZ '2026-11-01 10:00:00+00', TIMESTAMPTZ '2027-03-14 10:00:00+00'),
    ('Canada/Pacific',      TIMESTAMPTZ '2026-11-01 10:00:00+00', TIMESTAMPTZ '2027-03-14 10:00:00+00'),
    ('America/Edmonton',    TIMESTAMPTZ '2026-11-01 09:00:00+00', TIMESTAMPTZ '2027-03-14 09:00:00+00'),
    ('America/Yellowknife', TIMESTAMPTZ '2026-11-01 09:00:00+00', TIMESTAMPTZ '2027-03-14 09:00:00+00'),
    ('Canada/Mountain',     TIMESTAMPTZ '2026-11-01 09:00:00+00', TIMESTAMPTZ '2027-03-14 09:00:00+00'),
    ('America/Inuvik',      TIMESTAMPTZ '2026-11-01 09:00:00+00', TIMESTAMPTZ '2027-03-14 09:00:00+00'),
    ('America/Winnipeg',    TIMESTAMPTZ '2026-11-01 08:00:00+00', TIMESTAMPTZ '2027-03-14 08:00:00+00'),
    ('Canada/Central',      TIMESTAMPTZ '2026-11-01 08:00:00+00', TIMESTAMPTZ '2027-03-14 08:00:00+00')
)
UPDATE "AvailabilitySlot" AS s
SET
  "startTime" = CASE
    WHEN s."startTime" >= z."fromUtc" AND s."startTime" < z."untilUtc"
      THEN s."startTime" - INTERVAL '1 hour'
    ELSE s."startTime"
  END,
  "endTime" = CASE
    WHEN s."endTime" >= z."fromUtc" AND s."endTime" < z."untilUtc"
      THEN s."endTime" - INTERVAL '1 hour'
    ELSE s."endTime"
  END
FROM "User" AS u
JOIN affected_zone AS z ON z."zone" = u."timezone"
WHERE s."userId" = u."id"
  AND (
    (s."startTime" >= z."fromUtc" AND s."startTime" < z."untilUtc")
    OR (s."endTime" >= z."fromUtc" AND s."endTime" < z."untilUtc")
  );
