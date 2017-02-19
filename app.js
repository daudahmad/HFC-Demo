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
const app = express();
var setup = require('./setup');
var util = require('util');
var hfc = require('hfc');

var userObj;

//get the addresses from the docker-compose environment
// var PEER_ADDRESS         = process.env.PEER_ADDRESS;
// var MEMBERSRVC_ADDRESS   = process.env.MEMBERSRVC_ADDRESS;
var PEER_ADDRESS = "0.0.0.0:7051"
var MEMBERSRVC_ADDRESS = "0.0.0.0:7054"
//// Set Server Parameters ////
var host = setup.SERVER.HOST;
var port = setup.SERVER.PORT;

app.use(express.static('public'));


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
chain.setMemberServicesUrl("grpc://" + MEMBERSRVC_ADDRESS);

// Add at least one peer's URL.  If you add multiple peers, it will failover
// to the 2nd if the 1st fails, to the 3rd if both the 1st and 2nd fails, etc.
chain.addPeer("grpc://" + PEER_ADDRESS);
chain.setDevMode(true);

enrollUser();

// ============================================================================================================================
// 														Launch Webserver
// ============================================================================================================================
var server = http.createServer(app).listen(8080, function () {});
console.log('------------------------------- Server Up - ' + host + ':' + port + ' ------------------------------------------');


function enrollUser() {

    // Enroll a 'admin' who is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
    chain.enroll(user, userPwd, function(err, admin) {
        if (err) throw Error("\nERROR: failed to enroll admin : " + err);

        console.log("\nEnrolled admin sucecssfully");
        userObj = admin;
        deployChaincode();
    });
}

function deployChaincode() {

    // var args = getArgs(config.deployRequest);
    var args = ["jim-bankaccount", "100000", "jon-bankaccount", "100000"];
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
    deployTx.on('complete', function(results) {
        // Deploy request completed successfully
        chaincodeID = results.chaincodeID;
        console.log("\nChaincode ID : " + chaincodeID);
        console.log(util.format("\nSuccessfully deployed chaincode: request=%j, response=%j", deployRequest, results));
        // Save the chaincodeID
        fs.writeFileSync(chaincodeIDPath, chaincodeID);
        invoke();
    });

    deployTx.on('error', function(err) {
        // Deploy request failed
        console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
        process.exit(1);
    });
}

// Handle a user request
function handleUserRequest(userName, userAccount, chaincodeID, fcn, args) {
    // Register and enroll this user.
    // If this user has already been registered and/or enrolled, this will
    // still succeed because the state is kept in the KeyValStore
    // (i.e. in '/tmp/keyValStore' in this sample).
    var registrationRequest = {
        roles: ['client'],
        enrollmentID: userName,
        affiliation: "bank_a"
        //attributes: [{name:'role',value:'client'},{name:'account',value:userAccount}]
    };

    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: fcn,
        // Parameters for the invoke function
        args: args
    };
    // Invoke the request from the user object and wait for events to occur.
    var tx = user.invoke(invokeRequest);
    // Listen for the 'submitted' event
    tx.on('submitted', function (results) {
        console.log("submitted invoke: %j", results);
    });
    // Listen for the 'complete' event.
    tx.on('complete', function (results) {
        console.log("completed invoke: %j", results);
    });
    // Listen for the 'error' event.
    tx.on('error', function (err) {
        console.log("error on invoke: %j", err);
    });
}

function query(chaincodeID, fcn, args) {
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
        // process.exit(0);
    });
    queryTx.on('error', function (err) {
        // Query failed
        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest, err);
        // process.exit(1);
    });
}