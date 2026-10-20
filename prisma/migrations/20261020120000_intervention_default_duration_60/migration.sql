-- Default length of a workshop: 60 minutes (was 120). Only the column default
-- changes: existing rows keep their duration, the app always sends one.
ALTER TABLE "Intervention" ALTER COLUMN "durationMinutes" SET DEFAULT 60;
