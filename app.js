/**
 * This example shows how to do the following in a web app.
 * 1) At initialization time, enroll the web app with the blockchain.
 *    The identity must have already been registered.
 * 2) At run time, after a user has authenticated with the web app:
 *    a) register and enroll an identity for the user;
 *    b) use this identity to deploy, query, and invoke a chaincode.
 */
const http = require('http');
const express = require('express');
var bodyParser = require("body-parser");
const app = express();
var setup = require('./setup');
var util = require('util');
var hfc = require('hfc');

var userObj;

//get the addresses from the docker-compose environment
// var PEER_ADDRESS         = process.env.PEER_ADDRESS;
// var MEMBERSRVC_ADDRESS   = process.env.MEMBERSRVC_ADDRESS;

//// Set Server Parameters ////
var host = setup.SERVER.HOST;
var port = setup.SERVER.PORT;

app.set('view engine', 'pug')
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

// Create a client chain.
// The name can be anything as it is only used internally.
var chain = hfc.newChain("targetChain");
var user = "WebAppAdmin";
var userPwd = "DJY27pEnl16d";
var userAccount = "";
var chaincodeID = "mycc";

// Configure the KeyValStore which is used to store sensitive keys
// as so it is important to secure this storage.
// The FileKeyValStore is a simple file-based KeyValStore, but you
// can easily implement your own to store whereever you want.
// To work correctly in a cluster, the file-based KeyValStore must
// either be on a shared file system shared by all members of the cluster
// or you must implement you own KeyValStore which all members of the
// cluster can share.
// chain.setKeyValStore(hfc.newFileKeyValStore('/tmp/keyValStore'));
chain.setKeyValStore(hfc.newFileKeyValStore(__dirname + '/keyValStore'));

// Set the URL for membership services
var MEMBERSRVC_ADDRESS = "0.0.0.0:7054"
chain.setMemberServicesUrl("grpc://" + MEMBERSRVC_ADDRESS);

// Add at least one peer's URL.  If you add multiple peers, it will failover
// to the 2nd if the 1st fails, to the 3rd if both the 1st and 2nd fails, etc.
var PEER_ADDRESS = "0.0.0.0:7051"
chain.addPeer("grpc://" + PEER_ADDRESS);

//Set this to true if running chaincode locally on development environment
chain.setDevMode(true);

enrollUser();

// ============================================================================================================================
// 														Launch Webserver
// ============================================================================================================================
var server = http.createServer(app).listen(8080, function () {});
console.log('------------------------------- Server Up - ' + host + ':' + port + ' ------------------------------------------');

// ============================================================================================================================
// 													Routing requests	
// ============================================================================================================================

app.post('/checkbalance', (request, response) => {
    console.log(util.format("\nChecking account balance for: accountname=%j", request.body.accountname));
    var accountname = request.body.accountname;
    query("query", [accountname], response);
});

app.post('/openaccount', (request, response) => {
    console.log(util.format("\nCreating new account: accountname=%j", request.body.accountname));
    console.log(util.format("\nCreating new account: initial balance=%j", request.body.initialbalance));
    var accountname = request.body.accountname;
    var initialbalance = request.body.initialbalance;
    invoke("open_account", [accountname, initialbalance], response);
});

app.post('/transferfunds', (request, response) => {
    console.log(util.format("\nSource account: source=%j", request.body.source));
    console.log(util.format("\nDestination account: destination=%j", request.body.destination));
    console.log(util.format("\nAmount to transfer: amount=%j", request.body.amount));
    var source = request.body.source;
    var destination = request.body.destination;
    var transferamount = request.body.amount;
    invoke("transfer_funds", [source, destination, transferamount], response);
});

// ============================================================================================================================
// 													Call blockchain using HFC SDK	
// ============================================================================================================================

function enrollUser() {

    // Enroll a 'admin' who is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
    chain.enroll(user, userPwd, function (err, admin) {
        if (err) throw Error("\nERROR: failed to enroll admin : " + err);

        console.log("\nEnrolled admin sucecssfully");
        userObj = admin;
        deployChaincode();
    });
}

function deployChaincode() {

    //Create 2 new bank accounts in the db with initial balance of $100,000
    var args = ["jim-account", "100000", "jon-account", "100000"];
    // Construct the deploy request
    var deployRequest = {
        // Function to trigger
        fcn: "init",
        // Arguments to the initializing function
        args: args,
        chaincodeName: "mycc"
        // the location where the startup and HSBN store the certificates
        // certificatePath: network.cert_path
    };

    // Trigger the deploy transaction
    var deployTx = userObj.deploy(deployRequest);

    // Print the deploy results
    deployTx.on('complete', function (results) {
        // Deploy request completed successfully
        chaincodeID = results.chaincodeID;
        console.log("\nChaincode ID : " + chaincodeID);
        console.log(util.format("\nSuccessfully deployed chaincode: request=%j, response=%j", deployRequest, results));
        // Save the chaincodeID
        // fs.writeFileSync(chaincodeIDPath, chaincodeID);
        // invoke();
    });

    deployTx.on('error', function (err) {
        // Deploy request failed
        console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
        process.exit(1);
    });
}

function query(fcn, args, response) {
    // var args = getArgs(config.queryRequest);
    // Construct the query request
    var queryRequest = {
        // Name (hash) required for query
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: fcn,
        // Existing state variable to retrieve
        args: args
    };

    // Trigger the query transaction
    var queryTx = userObj.query(queryRequest);

    // Print the query results
    queryTx.on('complete', function (results) {
        // Query completed successfully
        console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest, results.result.toString());
        var accountbalance = parseInt(results.result.toString(), 10);
        response.send(util.format("\n<h3>Account balance is: $%j</h3>", accountbalance));
        // process.exit(0);
    });
    queryTx.on('error', function (err) {
        // Query failed
        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest, err);
        response.send(util.format("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest, err));
        // process.exit(1);
    });
}

function invoke(fcn, args, response) {
    // var args = getArgs(config.invokeRequest);
    // var eh = chain.getEventHub();
    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: fcn,
        // Parameters for the invoke function
        args: args
    };

    // Trigger the invoke transaction
    var invokeTx = userObj.invoke(invokeRequest);

    // Print the invoke results
    invokeTx.on('submitted', function (results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function (results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        if (fcn == 'open_account') {
            response.send(util.format("\n<h3>New account has been opened successfully. <br>%j</h3>",
                results.result.toString()))
        }
        else {
            response.send(util.format("\n<h3>Funds trasferred successfully. <br>%j</h3>",
                results.result.toString()));
        }
    });
    invokeTx.on('error', function (err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
        response.send(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
        // process.exit(1);
    });
}


// app.get('/i', (request, response) => {
//     response.render(
//         'index', {
//             title: 'Hey Hey Hey!',
//             message: 'Yo Yo'
//         })
// });

// app.get('/o', (request, response) => {
//     response.render(
//         'openaccount', {
//             title: 'Hey Hey Hey!',
//             message: 'Yo Yo'
//         })
// });