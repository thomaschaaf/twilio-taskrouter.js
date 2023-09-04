import EnvTwilio from '../../util/EnvTwilio';
import Worker from '../../../lib/Worker';
import { getAccessToken } from '../../util/MakeAccessToken';
import { buildRegionForEventBridge } from '../../integration_test_setup/IntegrationTestSetupUtils';

const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const credentials = require('../../env');
const Twilio = require('twilio');

describe('Reservation Canceled', () => {
    const multiTaskAliceToken = getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid);
    const envTwilio = new EnvTwilio(credentials.accountSid, credentials.authToken, credentials.region);
    const client = new Twilio(credentials.accountSid, credentials.authToken);
    let worker;

    before(() => {
        return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
            worker = new Worker(multiTaskAliceToken, {
                connectActivitySid: credentials.multiTaskConnectActivitySid,
                region: buildRegionForEventBridge(credentials.region),
                edge: credentials.edge
            });
        });
    });

    after(() => {
        worker.removeAllListeners();
        return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
            return envTwilio.updateWorkerActivity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskAliceSid,
                credentials.multiTaskUpdateActivitySid
            );
        });
    });

    describe('#create reservation, cancel the task and cancel reservation', () => {
        // ORCH-1775 filed for unreliable test
        it('@SixSigma - should accept the reservation', () => {
            envTwilio.createTask(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskWorkflowSid,
                '{ "selected_language": "es" }'
            );

            return new Promise(resolve => {
                // Registering 'reservationCreated' listener for worker
                worker.on('reservationCreated', reservation => {
                    expect(worker.reservations.size).to.equal(1);
                    expect(reservation.status).to.equal('pending');
                    expect(reservation.sid.substring(0, 2)).to.equal('WR');
                    expect(reservation.task.sid.substring(0, 2)).to.equal('WT');
                    expect(reservation.task.taskChannelUniqueName).to.equal('default');
                    resolve(reservation);
                });
            }).then(reservation => {
                return Promise.resolve().then([
                     // Calling the 'canceled' event for the created reservation
                    reservation.on('canceled', canceledRes => {
                        expect(canceledRes.task.status).equal('canceled');
                        expect(canceledRes.status).equal('canceled');
                        assert.isFalse(Object.prototype.hasOwnProperty.call(canceledRes, 'canceledReasonCode'));
                    }),
                    client.taskrouter.workspaces(credentials.multiTaskWorkspaceSid)
                        .tasks(reservation.task.sid)
                        .update({ assignmentStatus: 'canceled' })
                ]);
            });
        }).timeout(30000);
    });
});
