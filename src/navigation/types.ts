export type RootStackParamList = {
  Home: undefined;
  Login: undefined;
  ResetPassword: undefined;
  AcceptFolderInvite: { token: string };
  Folder: { folderId: string };
  AddEditFolder: { folderId?: string; parentFolderId?: string | null } | undefined;
  AddEditItem: { itemId?: string; folderId?: string; sharedImportId?: string } | undefined;
  ItemDetail: { itemId: string };
  Search: undefined;
  ShareFolder: { folderId: string };
  PickSomething: { folderId?: string } | undefined;
  SyncConflict: undefined;
  Settings: undefined;
};
