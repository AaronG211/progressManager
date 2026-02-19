import type {
  StageOneBoardSnapshot,
  StageOneCellValue,
  StageOneColumn,
  StageOneItem,
  StageOneMember,
} from "@/lib/stage1/types";

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function formatDateValue(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toISOString().slice(0, 10);
}

function getCell(item: StageOneItem, columnId: string): StageOneCellValue | undefined {
  return item.values.find((value) => value.columnId === columnId);
}

function getMemberLabel(member: StageOneMember | undefined): string {
  if (!member) {
    return "";
  }

  return member.name || member.email;
}

function getCellDisplayValue(
  item: StageOneItem,
  column: StageOneColumn,
  membersById: Map<string, StageOneMember>,
): string {
  const value = getCell(item, column.id);

  if (!value) {
    return "";
  }

  if (column.type === "TEXT") {
    return value.textValue ?? "";
  }

  if (column.type === "STATUS") {
    return value.statusValue ?? "";
  }

  if (column.type === "PERSON") {
    if (!value.personId) {
      return "";
    }

    return getMemberLabel(membersById.get(value.personId)) || value.personId;
  }

  if (column.type === "DATE") {
    if (!value.dateValue) {
      return "";
    }

    return formatDateValue(value.dateValue);
  }

  if (column.type === "NUMBER") {
    return value.numberValue === null ? "" : String(value.numberValue);
  }

  if (column.type === "TAGS") {
    return value.tagsValue ? value.tagsValue.join(", ") : "";
  }

  if (column.type === "CHECKBOX") {
    if (value.checkboxValue === null) {
      return "";
    }

    return value.checkboxValue ? "Checked" : "Unchecked";
  }

  return value.urlValue ?? "";
}

export function buildBoardCsv(snapshot: StageOneBoardSnapshot): string {
  const header = ["Group", "Item", ...snapshot.columns.map((column) => column.name)];
  const rows: string[][] = [header];
  const membersById = new Map(snapshot.members.map((member) => [member.userId, member]));

  for (const group of snapshot.groups) {
    for (const item of group.items) {
      const row = [group.name, item.name];

      for (const column of snapshot.columns) {
        row.push(getCellDisplayValue(item, column, membersById));
      }

      rows.push(row);
    }
  }

  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");
}
