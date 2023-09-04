import EnvTwilio from '../../../util/EnvTwilio';
import Worker from '../../../../lib/Worker';
import { getAccessToken } from '../../../util/MakeAccessToken';
import OutboundCommonHelpers from '../../../util/OutboundCommonHelpers';
import {
    RESERVATION_CANCELED_REASON,
    CONNECTING_PARTICIPANT_ERROR_CODE,
    INVALID_NUMBER,
    GEO_NOT_ALLOW_NUMBER,
    TASK_CANCELED_REASON,
} from '../../../util/Constants';
import { buildRegionForEventBridge } from '../../../integration_test_setup/IntegrationTestSetupUtils';

const credentials = require('../../../env');

describe('Reservation with Outbound Voice Task', () => {
    const workerToken = getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid);
    const envTwilio = new EnvTwilio(credentials.accountSid, credentials.authToken, credentials.region);
    const outboundCommonHelpers = new OutboundCommonHelpers(envTwilio);
    let worker;

    beforeEach(() => {
        return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
            // make worker available
            worker = new Worker(workerToken, {
                connectActivitySid: credentials.multiTaskConnectActivitySid,
                region: buildRegionForEventBridge(credentials.region),
                edge: credentials.edge
            });

            return outboundCommonHelpers.listenToWorkerReadyOrErrorEvent(worker);
        });
    });

    afterEach(() => {
        worker.removeAllListeners();
        return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
            return envTwilio.updateWorkerActivity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskAliceSid,
                credentials.multiTaskUpdateActivitySid
            );
        });
    });

    describe('#conference reservation', () => {
        it('should issue a conference instruction on the Reservation', () => {
            return new Promise(async(resolve, reject) => {
                const workerReservation = await outboundCommonHelpers.createTaskAndAssertOnResCreated(worker);

                workerReservation.on('accepted', async() => {
                    try {
                        await outboundCommonHelpers.verifyConferenceProperties(workerReservation.task.sid, 'in-progress', 2);
                    } catch (err) {
                        reject(`Failed to validate Conference properties for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                    }
                });

                outboundCommonHelpers.assertOnResWrapUpAndCompleteEventOutbound(workerReservation).then(() => {
                    resolve('Outbound Reservation Conference test finished.');
                }).catch(err => {
                    reject(`Failed to validate wraup & completed event Task for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });

                workerReservation.conference({
                    endConferenceOnExit: true
                }).catch(err => {
                    reject(`Error in establishing conference for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });
            });
        }).timeout(50000);

        it('should issue a conference instruction on the Reservation even worker is offline', () => {
            // If a “RoutableTarget” is given, a Worker’s capacity and availability are ignored.
            envTwilio.updateWorkerActivity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskAliceSid,
                credentials.multiTaskUpdateActivitySid
            );

            return new Promise(async(resolve, reject) => {
                const workerReservation = await outboundCommonHelpers.createTaskAndAssertOnResCreated(worker);

                workerReservation.on('accepted', async() => {
                    try {
                       await outboundCommonHelpers.verifyConferenceProperties(workerReservation.task.sid, 'in-progress', 2);
                    } catch (err) {
                        reject(`Failed to validate Conference properties for Outbound Task ${workerReservation.task.sid}. Error. ${err}`);
                    }
                });

                outboundCommonHelpers.assertOnResWrapUpAndCompleteEventOutbound(workerReservation).then(() => {
                    resolve('Outbound Reservation Conference when worker is offline test finished.');
                }).catch(err => {
                    reject(`Failed to validate wraup & completed event for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });

                workerReservation.conference({
                    endConferenceOnExit: true
                }).catch(err => {
                    reject(`Error in establishing conference for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });
            });
        }).timeout(50000);

        it('should issue a conference instruction on the Reservation even worker has no capacity', () => {
            // If a “RoutableTarget” is given, a Worker’s capacity and availability are ignored.
            envTwilio.updateWorkerCapacity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskAliceSid,
                'default',
                0
            );

            return new Promise(async(resolve, reject) => {
                const workerReservation = await outboundCommonHelpers.createTaskAndAssertOnResCreated(worker);

                workerReservation.on('accepted', async() => {
                    try {
                        await outboundCommonHelpers.verifyConferenceProperties(workerReservation.task.sid, 'in-progress', 2);
                    } catch (err) {
                        reject(`Failed to validate Conference properties for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                    }
                });

                outboundCommonHelpers.assertOnResWrapUpAndCompleteEventOutbound(workerReservation).then(() => {
                    resolve('Outbound Reservation Conference when worker has no capacity test finished.');
                }).catch(err => {
                    reject(`Failed to validate wraup & completed event for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });

                workerReservation.conference({
                    endConferenceOnExit: true
                }).catch(err => {
                    reject(`Error in establishing conference or Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });
            });
        });
    }).timeout(50000);

    describe('#failed conference reservation', () => {
        before(() => {
            return envTwilio.updateWorkerCapacity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskAliceSid,
                'default',
                1
            );
        });

        it.skip('should cancel reservation after cancel the task', () => {
            const options = {
                reason: 'RoutingTarget not available',
            };

            return new Promise(async(resolve, reject) => {
                await envTwilio.updateWorkerCapacity(
                    credentials.multiTaskWorkspaceSid,
                    credentials.multiTaskAliceSid,
                    'default',
                    2
                );

                const workerReservation = await outboundCommonHelpers.createTaskAndAssertOnResCreated(worker, options);
                outboundCommonHelpers.assertOnResCancelEvent(workerReservation, ['in-progress', 'completed'], options).then(() => {
                    resolve('Outbound cancel reservation after cancel task test finished ');
                }).catch(err => {
                    reject(`Failed to validate wraup & completed event for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });

                workerReservation.conference({
                    endConferenceOnExit: true
                }).then(() => {
                    envTwilio.cancelTask(credentials.multiTaskWorkspaceSid, workerReservation.task.sid, options.reason).catch(err => {
                        reject(`Failed to cancel the Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                    });
                }).catch(err => {
                    reject(`Error in establishing conference for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });
            });
        });

        it('should cancel reservation if customer number is invalid', () => {
            const options = {
                customerNumber: INVALID_NUMBER,
                reasonCode: RESERVATION_CANCELED_REASON,
                reason: TASK_CANCELED_REASON + credentials.multiTaskAliceSid,
            };

            return new Promise(async(resolve, reject) => {
                const workerReservation = await outboundCommonHelpers.createTaskAndAssertOnResCreated(worker, options);

                outboundCommonHelpers.assertOnResCancelEvent(workerReservation, 'completed', options, 0).then(() => {
                    resolve('Outbound cancel reservation for invalid customer number test finished ');
                }).catch(err => {
                    reject(`Failed to validate wraup & completed event for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });

                workerReservation.conference({
                    endConferenceOnExit: true
                }).catch(err => {
                    reject(`Error in establishing conference or Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });
            });
        });

        it('should cancel reservation if customer number is not allowed for geo permission', () => {
            const options = {
                customerNumber: GEO_NOT_ALLOW_NUMBER,
                reasonCode: CONNECTING_PARTICIPANT_ERROR_CODE,
                reason: TASK_CANCELED_REASON + credentials.multiTaskAliceSid,
            };

            return new Promise(async(resolve, reject) => {
                const workerReservation = await outboundCommonHelpers.createTaskAndAssertOnResCreated(worker, options);

                outboundCommonHelpers.assertOnResCancelEvent(workerReservation, 'completed', options, 0).then(() => {
                    resolve('Outbound cancel reservation when customer number is not allowed for geo permission finished');
                }).catch(err => {
                    reject(`Failed to validate wraup & completed event for the Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });

                workerReservation.conference({
                    endConferenceOnExit: true
                }).catch(err => {
                    reject(`Error in establishing conference for Outbound Task ${workerReservation.task.sid}. Error: ${err}`);
                });
            });
        });
    });
});
