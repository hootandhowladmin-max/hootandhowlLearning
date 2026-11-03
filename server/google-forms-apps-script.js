const DEFAULT_WEBHOOK_URL =
  'https://hootandhowl-server.onrender.com/api/google-forms/admission';

function setupGoogleFormSync() {
  const ui = SpreadsheetApp.getUi();
  const webhookResponse = ui.prompt(
    'Google Forms Sync',
    'Enter the public backend webhook URL:',
    ui.ButtonSet.OK_CANCEL
  );
  if (webhookResponse.getSelectedButton() !== ui.Button.OK) return;

  const secretResponse = ui.prompt(
    'Google Forms Sync',
    'Enter the Google Forms sync secret:',
    ui.ButtonSet.OK_CANCEL
  );
  if (secretResponse.getSelectedButton() !== ui.Button.OK) return;

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('WEBHOOK_URL', webhookResponse.getResponseText().trim());
  properties.setProperty('SYNC_SECRET', secretResponse.getResponseText().trim());

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const existing = ScriptApp.getProjectTriggers().filter(
    trigger => trigger.getHandlerFunction() === 'syncFormSubmission'
  );
  existing.forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('syncFormSubmission')
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();

  ui.alert('Google Form sync configured successfully.');
}

function syncFormSubmission(event) {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl =
    properties.getProperty('WEBHOOK_URL') || DEFAULT_WEBHOOK_URL;
  const secret = properties.getProperty('SYNC_SECRET');
  if (!secret) throw new Error('Run setupGoogleFormSync first.');

  const values = {};
  if (event && event.namedValues) {
    Object.entries(event.namedValues).forEach(([question, responses]) => {
      values[question] = Array.isArray(responses)
        ? responses.join(', ')
        : responses;
    });
  }

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-google-forms-secret': secret },
    payload: JSON.stringify({ values }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(
      `Admission sync failed (${response.getResponseCode()}): ${response.getContentText()}`
    );
  }
}
