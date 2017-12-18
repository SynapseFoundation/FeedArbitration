const accounts = require('../account.js');
const crypto = require('crypto');
const fs = require('fs');
const Web3 = require('web3');
const SharedCrypto = require('./sharedcrypto.js');
const SynapseSubscription = require('./subscriptionSubscriber.js');
const ConfigStorage = require('./configstorage.js');

// Market contract
const file = __dirname + "/../market/contracts/abi.json";
const abi = JSON.parse(fs.readFileSync(file));
const marketAddress = "0x732a5496383DE6A55AE2Acc8829BE7eCE0833113";

// Create a sending RPC
const setRPCAddress = fs.existsSync(__dirname + "/NodeConfig/.rpcAddress") ? JSON.parse(fs.readFileSync(__dirname + "/NodeConfig/.rpcAddress")).RPC : null;
const rpcHost = setRPCAddress || "https://rinkeby.infura.io";
const web3 = new Web3(new Web3.providers.HttpProvider(rpcHost));
const SynapseMarket = new web3.eth.Contract(abi, marketAddress);

// Create a listening RPC

const setWSAddress = fs.existsSync(__dirname + "/NodeConfig/.wsAddress")?JSON.parse(fs.readFileSync(__dirname + "/NodeConfig/.wsAddress")).WS : null;
const rpcHost_listen = setWSAddress || "ws://dendritic.network:8546";
const web3_listen = new Web3(Web3.givenProvider || rpcHost_listen);
const SynapseMarket_listen = new web3_listen.eth.Contract(abi, marketAddress);

// Accounts
const privateKeyHex = "0x1b851e482a6d0bad7fb0a958741ecf4fcd6b1f44cb39f9f625705fd0cc4e0382"; //test account with ethers
const account = new accounts(privateKeyHex);
account.setWeb3(web3);
console.log("wallet Address ", web3.eth.accounts.wallet[0].address);

// if (ConfigStorage.exists(__dirname + "/.currentAccount")) {
//     console.log("Loading configuration from", "currentAccount");

//     const data = JSON.parse(ConfigStorage.load(__dirname + "/.currentAccount"));
//     const privateKeyHex = data.privateKey;
//     const account = new accounts(privateKeyHex);

//     account.setWeb3(web3);
//     console.log("wallet Address ", web3.eth.accounts.wallet[0].address);
// }



class SynapseSubscriber {
    constructor(marketAddress, args, callback = undefined) {
        this.marketInstance = SynapseMarket;
        this.checkForRegister(args, callback);
    }

    // Check whether or not we need to register, if so register
    checkForRegister(args, callback) {
        // Already regsitered
        if (args.action == 'load') {
            if (fs.existsSync(__dirname + "/" + args.fileName)) {

                const data = JSON.parse(fs.readFileSync(__dirname + "/" + args.fileName));

                this.private_key = data.private_key;

                // Generate a secp224k1 keypair
                this.keypair = new SharedCrypto.PublicKey(null, this.private_key);

                console.log("public key", this.keypair.getPublic());
                console.log("private key", this.keypair.getPrivate());

                // Load the subscriptions into internal objects
                this.subscriptions = data.subscriptions.map(data => {
                    const obj = SynapseSubscription.fromObject(data);
                    // If a callback was passed, initiate the stream with that
                    if (callback) {
                        obj.data(callback);
                    }

                    return obj;
                });

                return;
            }
        } else if (args.action == 'new') {
            this.keypair = new SharedCrypto.PublicKey();

            console.log("Successfully registered");
            console.log("public key", this.keypair.getPublic());
            const public_key = this.keypair.getPublic();
            console.log("private key", this.keypair.getPrivate());

            fs.writeFileSync(__dirname + "/.0x" + public_key, JSON.stringify({
                private_key: this.keypair.getPrivate(),
                subscriptions: []
            }));

            this.subscriptions = [];
            this.newSubscription(args.groupName, callback);
        }
    }

    // Create a new subscription
    newSubscription(group, callback) {
        // Conver group to bytes32 string
        group = web3.utils.utf8ToHex(group);

        console.log("Looking for a provider of data");

        // Send the request
        this.marketInstance.methods.requestSynapseProvider(group).send({
            from: web3.eth.accounts.wallet[0].address,
            gas: 4700000 // TODO - not this
        }, (err, result) => {
            if (err) {
                throw err;
            }

            console.log("Sent the request", result);

            // Watch for SynapseProviderFound events
            SynapseMarket_listen.events.SynapseProviderFound('latest', (error, found_res) => {
                if (error) {
                    throw error;
                }

                // Make sure it was generated by the above request
                if (found_res.transactionHash != result) {
                    //return;
                }

                console.log("Found a provider of data", found_res, result);

                // Get the index of the provider
                const provider_index = found_res.returnValues.index;

                this.newSubscriptionWithIndex(provider_index, group, 0, callback);

            });

        });
    }

    // Start a subscription with a provider index
    newSubscriptionWithIndex(provider_index, group, amount, callback) {
        console.log("Starting subscription with index", provider_index);

        // Make sure group is a bytes32 compatible object
        if (group.substring(0, 2) != '0x') {
            group = web3.utils.utf8ToHex(group);
        }

        // Get the information of the provider

        let provAddrProm = this.marketInstance.methods.getProviderAddress(group, provider_index).call().then();
        let provPublicProm = this.marketInstance.methods.getProviderPublic(group, provider_index).call().then();
        return Promise.all([provAddrProm, provPublicProm]).then(res => {
            console.log(res);
            let providers_address = res[0];
            let providers_public = res[1];

            providers_address = providers_address.slice(0, 2) + providers_address.substr(-40);
            let provider_public_hex = providers_public.substr(2, 58);

            console.log("providers address", providers_address);
            console.log("providers public", providers_public);

            /*
            if (provider_public_hex.length != (28 * 2)) {
                provider_public_hex = provider_public_hex.slice(0, 58);
            }*/

            // Do the key exchange
            const provider_public_ec = new SharedCrypto.PublicKey(provider_public_hex, null);
            const secret = this.keypair.generateSecret(provider_public_ec);
            console.log("secret", secret);

            // Generate a nonce
            const nonce = new Buffer(crypto.randomBytes(16));
            const nonce_hex = "0x" + nonce.toString('hex');

            // Generate a UUID
            const raw_uuid = crypto.randomBytes(32);
            console.log("raw_uuid", raw_uuid);

            const uuid = raw_uuid.toString('base64');
            console.log("uuid", uuid);

            // Setup the cipher object with the secret and nonce
            console.log("nonce", nonce);
            const cipher = crypto.createCipheriv('aes-256-ctr', secret, nonce);
            cipher.setAutoPadding(true);

            // Encrypt it (output is buffer)
            const euuid = Buffer.concat([cipher.update(raw_uuid), cipher.final()]);

            console.log(euuid.length);

            // Sanity check
            if (euuid.length != 32) {
                throw new Error("encrypted uuid is an invalid length");
            }

            // Hexify the euuid
            console.log();
            const euuid_hex = "0x" + new Buffer(euuid, 'ascii').toString('hex');
            console.log(euuid_hex);

            // Get my public key
            const public_key = "0x" + this.keypair.getPublic();

            // Parse the amount
            amount = web3.utils.fromDecimal(amount);

            console.log("Initiating data feed...");

            // Initiate the data feed
            return this.marketInstance.methods.initSynapseDataFeed(
                group,
                providers_address,
                public_key,
                euuid_hex,
                nonce_hex,
                amount
            ).send({
                from: web3.eth.accounts.wallet[0].address,
                gas: 4700000 // TODO - not this
            }).once('transactionHash', (transactionHash) => {
                //SynapseMarket_listen.events.allEvents({}, function (error, log) {
                //    if (!error)
                //        console.log(875685,log);
                //});

                //console.log(3,transactionHash)

            }).on("error", (error) => {
                console.log(37776, error);
            }).then((receipt) => {
                console.log("Data feed initiated");

                // Create the subscription object
                // address, secret, nonce, endblock, uuid
                const subscription = new SynapseSubscription(providers_address, secret, nonce, -1, uuid);
                subscription.data(callback);
                this.subscriptions.push(subscription);
                this.save();
            });

        });
    }
    save() {
        // Save private key and the serialized subscribers
        fs.writeFileSync(__dirname + "/.0x" + this.keypair.getPublic(), JSON.stringify({
            private_key: this.keypair.getPrivate(),
            subscriptions: this.subscriptions.map(subscriber => subscriber.toObject())
        }));
    }
}

module.exports = SynapseSubscriber;
