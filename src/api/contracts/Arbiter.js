const Base = require('./Base');
class Arbiter extends Base {
    constructor(){
        super(Base.getConfig().arbiterArtifact)
    }
    // Initiate a subscription
    async initiateSubscription({provider, endpoint, endpointParams, blocks, publicKey, from, gas}) {
        try {
            // Make sure we could parse it correctly
            if (endpointParams instanceof Error) {
                throw endpointParams;
            }
            for(let i in endpointParams){
                endpointParams[i] = this.web3.utils.utf8ToHex(endpointParams[i])
            }

            return await this.contract.methods.initiateSubscription(
                provider,
                this.web3.utils.utf8ToHex(endpoint),
                endpointParams,
                this.web3.utils.toBN(publicKey),
                this.web3.utils.toBN(blocks)).send({from: from, gas: gas});
        } catch (err) {
            throw err;
        }
    }

    async endSubscription({provider, endpoint, from, gas}) {
        try {
            return await this.contract.methods.endSubscriptionSubscriber(
                provider,
                this.web3.utils.utf8ToHex(endpoint))
                .send({from: from, gas: gas});
        } catch (err) {
            throw err;
        }
    }

    listenSubscriptionEnd(filters,callback){
        try {
            // Specify filters and watch Incoming event
            let filter = this.contract.events.DataSubscriptionEnd(
                filters,
                { fromBlock: filters.fromBlock ? filters.fromBlock : 0, toBlock: 'latest' });
            filter.watch(callback);
        } catch (err) {
            throw err;
        }
    }

    listenSubscriptionStart(filters,callback){
        try {
            // Specify filters and watch Incoming event
            let filter = this.contract.events.DataPurchase(
                filters,
                { fromBlock: filters.fromBlock ? filters.fromBlock : 0, toBlock: 'latest' });
            filter.watch(callback);
        } catch (err) {
            throw err;
        }
    }


    /**
     * Listen to all events
     * @param callback
     */
    listen(callback){
        let filter = this.contract.events.allEvents({fromBlock:0, toBlock: 'latest'});
        filter.watch(callback);
    }


}

module.exports = Arbiter;
