export const ALLOWED_ACTIONS=new Set([
'login','logout','getSession','searchRecipients','searchStudents','getStudent','getStudentSafetyProfile','updateStudentSafetyProfile','getStudentHistory','importStudents','importStaffMaster',
'getSymptoms','submitVisit','submitDispense','getDispenseHistory','getItems','getStock','getStockLots','receiveStock','adjustStock','getStockTransactions','getStockReconciliation',
'getInventoryIntegrity','updateStockLotStatus','submitStockCount','getStockCounts','importItems','getDashboardData','getDashboardV2','getDashboardSummary','getVisitTrend',
'getTopSymptoms','getTopItems','getLowStock','getExpiryAlerts','getUsers','createUser','updateUser','deactivateUser','resetPassword','getConfig','updateConfig',
'getNotificationLog','retryNotification','reconcileNotifications','resolveUncertainNotification','submitSyntheticUatVisit',
'getDrugAllergyRules','saveDrugAllergyRule','publishDrugAllergyRule','submitSyntheticAllergyDraft','publishSyntheticAllergyRule']);
export const MUTATING_ACTIONS=new Set(['updateStudentSafetyProfile','importStudents','importStaffMaster','submitVisit','submitDispense','receiveStock','adjustStock',
'updateStockLotStatus','submitStockCount','importItems','createUser','updateUser','deactivateUser','resetPassword','updateConfig','retryNotification',
'reconcileNotifications','resolveUncertainNotification','saveDrugAllergyRule','publishDrugAllergyRule','submitSyntheticAllergyDraft','publishSyntheticAllergyRule']);
export const REQUIRED_API_VERSION='2.4.1';