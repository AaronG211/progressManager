-- Stage 3: expand board column types and typed cell values
ALTER TYPE "BoardColumnType" ADD VALUE IF NOT EXISTS 'NUMBER';
ALTER TYPE "BoardColumnType" ADD VALUE IF NOT EXISTS 'TAGS';
ALTER TYPE "BoardColumnType" ADD VALUE IF NOT EXISTS 'CHECKBOX';
ALTER TYPE "BoardColumnType" ADD VALUE IF NOT EXISTS 'URL';

ALTER TABLE "BoardCellValue"
ADD COLUMN "numberValue" DOUBLE PRECISION,
ADD COLUMN "tagsValue" JSONB,
ADD COLUMN "checkboxValue" BOOLEAN,
ADD COLUMN "urlValue" TEXT;
