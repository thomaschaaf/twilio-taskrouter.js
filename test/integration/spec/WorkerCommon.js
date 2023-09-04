import Configuration from '../../../lib/util/Configuration';
import EnvTwilio from '../../util/EnvTwilio';
import Worker from '../../../lib/Worker';
import { buildRegionForEventBridge } from '../../integration_test_setup/IntegrationTestSetupUtils';

const chai = require('chai');
chai.use(require('sinon-chai'));
chai.should();
const assert = chai.assert;
const expect = chai.expect;
const sinon = require('sinon');
const credentials = require('../../env');
const JWT = require('../../util/MakeAccessToken');

describe('Common Worker Client', () => {
    const aliceToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid);
    const bobToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid);
    const envTwilio = new EnvTwilio(credentials.accountSid, credentials.authToken, credentials.region);

    let alice;
    beforeEach(() => {
        return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
            alice = new Worker(aliceToken, {
                region: buildRegionForEventBridge(credentials.region),
                edge: credentials.edge,
                logLevel: 'error'
            });
        });
    });

    afterEach(() => {
        alice.removeAllListeners();
        return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid);
    });

    describe('constructor', () => {
        it('@SixSigma - should create an instance of Client', () => {
            assert.instanceOf(alice, Worker,
                envTwilio.getErrorMessage('Client is not an instance of worker', credentials.accountSid, credentials.multiTaskAliceSid));

        });

        it('@SixSigma - should set correct log level', () => {
            assert.equal(alice._log.getLevel(), 'error',
                envTwilio.getErrorMessage('Client log level setting mismatch', credentials.accountSid, credentials.multiTaskAliceSid));

        });

        it('@SixSigma - should create an instance of Configuration', () => {
            assert.instanceOf(alice._config, Configuration,
                envTwilio.getErrorMessage('Client configuration is not an instance of configuration', credentials.accountSid, credentials.multiTaskAliceSid));

        });
    });

    describe('#setAttributes(newAttributes)', () => {
        it('@SixSigma - should set the attributes of the worker', () => {
            const newAttributes = { languages: ['en'], name: 'Ms. Alice' };

            return new Promise(resolve => {
                alice.on('ready', resolve);
            }).then(() => {
                const origAttributes = alice.attributes;
                return alice.setAttributes(newAttributes).then(updatedAlice => {
                    expect(alice).to.equal(updatedAlice);
                    expect(alice.attributes).to.deep.equal(newAttributes);
                    alice.setAttributes(origAttributes);
                });
            });
        }).timeout(5000);

        it('should return an error if unable to set the attributes', () => {
            (() => {
                alice.setAttributes('foo');
            }).should.throw(/attributes is a required parameter/);
        });
    });

    describe('#updateToken(newToken)', () => {
        it('@SixSigma - should update the token on the Signaling instance', () => {
            const spy = sinon.spy();
            alice.on('tokenUpdated', spy);

            let updateAliceToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid);
            alice.updateToken(updateAliceToken);
            assert.equal(alice._config.token, updateAliceToken,
                envTwilio.getErrorMessage('Token no updated as expected', credentials.accountSid, credentials.multiTaskAliceSid));

            assert.isTrue(spy.calledOnce,
                envTwilio.getErrorMessage('Update token called more than once', credentials.accountSid, credentials.multiTaskAliceSid));

            assert.isTrue(alice._signaling.reconnect,
                envTwilio.getErrorMessage('Account reconnect did not happen', credentials.accountSid, credentials.multiTaskAliceSid));

        }).timeout(5000);
    });


  describe('Two Worker clients in the same browser', () => {
        it('should not allow log levels across unique workers to be affected', () => {
            const bob = new Worker(bobToken, {
                region: buildRegionForEventBridge(credentials.region),
                edge: credentials.edge,
                logLevel: 'info'
            });

            assert.equal(alice._config._logLevel, 'error');
            assert.equal(bob._config._logLevel, 'info');

            assert.equal(alice._log.getLevel(), 'error');
            assert.equal(bob._log.getLevel(), 'info');
        });
    });

    describe('should disconnect', () => {
        it('should fire a disconnect event', done => {
            const bob = new Worker(bobToken, {
                region: buildRegionForEventBridge(credentials.region),
                edge: credentials.edge,
                logLevel: 'info'
            });

            bob.on('ready', () => bob.disconnect());
            bob.on('disconnected', event => {
                assert.equal(event.message, 'SDK Disconnect',
                     envTwilio.getErrorMessage('SDK disconnect message mismatch', credentials.accountSid, credentials.multiTaskBobSid));

                done();
            });
        });

        it('[backward compatibility] should fire a disconnect event', done => {
            const bob = new Worker(bobToken, {
                ebServer: credentials.ebServer,
                wsServer: credentials.wsServer,
                logLevel: 'info'
            });

            bob.on('ready', () => bob.disconnect());
            bob.on('disconnected', event => {
                assert.equal(event.message, 'SDK Disconnect',
                    envTwilio.getErrorMessage('SDK disconnect message mismatch', credentials.accountSid, credentials.multiTaskBobSid));
                done();
            });
        });
    });

    describe('Worker Versioning', () => {
        it('@SixSigma - should update the version of the worker', (done) => {
            new Promise(resolve => {
                alice.on('ready', resolve);
            }).then(()=> {
                const oldVersion = alice.version;

                return alice.setAttributes({ languages: ['en'] }).then(updatedWorker => {
                    // version will stay the same if the worker already has the given attributes
                    assert.isTrue(oldVersion <= updatedWorker.version);
                    done();
                });

            });
        }).timeout(5000);

        it('@SixSigma - should update worker version after creating reservation', async() => {
            await new Promise(resolve => alice.on('ready', resolve));

            await alice.createTask('customer', 'worker', credentials.multiTaskWorkflowSid, credentials.multiTaskQueueSid);
            const oldVersion = alice.version;
            alice.on('reservationCreated', ()=>{
                expect(Number(alice.version)).to.equal(Number(oldVersion) + 1);
            });
            await alice.createTask('customer', 'worker', credentials.multiTaskWorkflowSid, credentials.multiTaskQueueSid);
        }).timeout(5000);

        it('@SixSigma - should not update worker version after rejecting reservation', async() => {
            await new Promise(resolve => alice.on('ready', resolve));
            const oldVersion = alice.version;
            alice.on('reservationCreated', async(reservation)=>{
                alice.on('rejected', async() => {
                    await alice.fetchLatestVersion();
                    expect(Number(oldVersion)).to.equal(Number(alice.version));
                });
                await reservation.reject();
            });
            await alice.createTask('customer', 'worker', credentials.multiTaskWorkflowSid, credentials.multiTaskQueueSid);
        }).timeout(10000);
    });
});
