# Deployment
1. Create Google Spreadsheet; Extensions > Apps Script.
2. Add backend/Code.gs and run setupSystem().
3. Create initial user with seedUser(), then change password immediately.
4. Deploy Apps Script as Web App according to Workspace policy.
5. Build frontend with VITE_GAS_URL set to the Web App URL.
6. Publish frontend/dist to GitHub Pages.
Do not publish the spreadsheet or credentials.
