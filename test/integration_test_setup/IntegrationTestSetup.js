/* eslint-disable */

require('dotenv').config({ path: `${__dirname}/.env` });
const { updateActivitiesInTaskQueue,
    createActivities,
    createWorkspace,
    createWorkers,
    getEventBridgeUrl,
    getTwilioClient,
    buildRegionForEventBridge
} = require('./IntegrationTestSetupUtils');


const ACCOUNT_SID = process.env.ACCOUNT_SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const SIGNING_KEY_SID = process.env.SIGNING_KEY_SID;
const SIGNING_KEY_SECRET = process.env.SIGNING_KEY_SECRET;
const WORKSPACE_FRIENDLY_NAME = process.env.WORKSPACE_FRIENDLY_NAME;
const client = getTwilioClient();
const fs = require('fs');

async function createWorkspaces() {

    // Create a multiTaskWorkspace
    const multiTaskWorkspace = await createWorkspace(WORKSPACE_FRIENDLY_NAME, "true")

    // Update multiTaskActivities
    const { multiTaskOffline, multiTaskAvailable, multiTaskBusy, multiTaskReserved } = await createActivities(
        multiTaskWorkspace.sid
    );

    // Update multiTaskqueues
    const multiTaskqueue = await updateActivitiesInTaskQueue(multiTaskWorkspace, multiTaskBusy, multiTaskReserved);

    await client.taskrouter.workspaces(multiTaskWorkspace.sid)
        .taskQueues(multiTaskqueue.sid)
        .update({
            assignmentActivitySid: multiTaskBusy.sid, reservationActivitySid: multiTaskReserved.sid
        });

    // Create multiTaskWorkers
    const { multiTaskAlice, multiTaskBob } = await createWorkers(multiTaskWorkspace);

    const multiTaskWorkflows = await client.taskrouter.workspaces(multiTaskWorkspace.sid)
        .workflows
        .list();
    const multiTaskWorkflow = await multiTaskWorkflows[0];

    const eventBridgeUrl = getEventBridgeUrl();

    const ENV = process.env.ENV;
    const REGION = process.env.REGION;
    // Write required variables to json file
    const obj = {
        'accountSid': ACCOUNT_SID,
        'authToken': AUTH_TOKEN,
        'signingKeySid': SIGNING_KEY_SID,
        'signingKeySecret': SIGNING_KEY_SECRET,
        'multiTaskWorkspaceSid': multiTaskWorkspace.sid,
        'multiTaskQueueSid': multiTaskqueue.sid,
        'multiTaskWorkflowSid': multiTaskWorkflow.sid,
        'multiTaskAliceSid': multiTaskAlice.sid,
        'multiTaskBobSid': multiTaskBob.sid,
        'multiTaskConnectActivitySid': multiTaskAvailable.sid,
        'multiTaskUpdateActivitySid': multiTaskOffline.sid,
        'multiTaskNumActivities': 4,
        'multiTaskNumChannels': 5,
        'ebServer': `https://${eventBridgeUrl}/v1/wschannels`,
        'wsServer': `wss://${eventBridgeUrl}/v1/wschannels`,
        'hasSingleTasking': false,
        'supervisorNumber': '',
        'customerNumber': '',
        'flexCCNumber': '',
        'workerNumber': '',
        'region': buildRegionForEventBridge(REGION || ENV),
        'edge': process.env.EDGE
    };

    if (['stage', 'dev'].includes(ENV)) {
        obj.env = ENV;
    }

    const data = JSON.stringify(obj, null, 2);
    // Write required variables to json file
    fs.writeFileSync('test.json', data);
}

createWorkspaces();
