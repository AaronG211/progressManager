export type StageOneColumnType =
  | "TEXT"
  | "STATUS"
  | "PERSON"
  | "DATE"
  | "NUMBER"
  | "TAGS"
  | "CHECKBOX"
  | "URL";
export type StageBoardViewType = "TABLE" | "KANBAN" | "CALENDAR" | "TIMELINE";

export type StageOneStatusOption = {
  label: string;
  color: string;
};

export type StageOneColumnSettings = {
  options?: StageOneStatusOption[];
};

export type StageOneColumn = {
  id: string;
  name: string;
  type: StageOneColumnType;
  position: number;
  settings: StageOneColumnSettings | null;
};

export type StageOneCellValue = {
  id: string;
  itemId: string;
  columnId: string;
  textValue: string | null;
  statusValue: string | null;
  personId: string | null;
  dateValue: string | null;
  numberValue: number | null;
  tagsValue: string[] | null;
  checkboxValue: boolean | null;
  urlValue: string | null;
};

export type StageOneItem = {
  id: string;
  groupId: string;
  name: string;
  position: number;
  lastEditedById: string | null;
  values: StageOneCellValue[];
};

export type StageOneGroup = {
  id: string;
  name: string;
  position: number;
  isCollapsed: boolean;
  items: StageOneItem[];
};

export type StageOneMember = {
  userId: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
};

export type StageBoardViewConfig = {
  statusValue?: string | null;
  personId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  timelineStartColumnId?: string | null;
  timelineEndColumnId?: string | null;
  numberMin?: number | null;
  numberMax?: number | null;
  tagValue?: string | null;
  checkboxValue?: boolean | null;
  urlQuery?: string | null;
  sortBy?:
    | "manual"
    | "name_asc"
    | "name_desc"
    | "date_asc"
    | "date_desc"
    | "number_asc"
    | "number_desc";
};

export type StageBoardView = {
  id: string;
  name: string;
  type: StageBoardViewType;
  position: number;
  config: StageBoardViewConfig | null;
};

export type StageOneBoardSnapshot = {
  workspaceId: string;
  boardId: string;
  boardName: string;
  views: StageBoardView[];
  columns: StageOneColumn[];
  groups: StageOneGroup[];
  members: StageOneMember[];
};

export type StageOneCreateGroupRequest = {
  name: string;
};

export type StageOneCreateItemRequest = {
  groupId: string;
  name: string;
};

export type StageOneUpdateGroupRequest = {
  name?: string;
  isCollapsed?: boolean;
};

export type StageOneUpdateItemRequest = {
  name?: string;
  groupId?: string;
};

export type StageOneUpdateCellRequest = {
  textValue?: string | null;
  statusValue?: string | null;
  personId?: string | null;
  dateValue?: string | null;
  numberValue?: number | null;
  tagsValue?: string[] | null;
  checkboxValue?: boolean | null;
  urlValue?: string | null;
};

export type StageOneReorderColumnsRequest = {
  columnIds: string[];
};
