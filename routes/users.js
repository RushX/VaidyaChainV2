const express = require('express');
const api = express.Router();
const Web3 = require('web3');
const HDWalletProvider = require('@truffle/hdwallet-provider');
const admin = require('firebase-admin');
const cw = require('crypto-wallets')
const dotenv = require('dotenv');
dotenv.config();
const web3 = new Web3(process.env.INFURA_API_KEY); // Replace with your blockchain provider URL
const { abi } = require('./CredentialVerificationV3.json');
const contractAddress = process.env.CONTRACT_ADDRESS





// console.log(`${process.env.INFURA_API_KEY}`)

// Initialize Firebase Admin SDK
const serviceAccount = require('../google-service-account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();
function addAddressToBlockchain(address) {
    return new Promise((resolve, reject) => {
        // Perform the necessary steps to add the user address to the blockchain
        // Example: Use web3.js to interact with your smart contract
        const contract = new web3.eth.Contract(abi, contractAddress);
        const adminAddress = process.env.ADMIN_ADDRESS;

        web3.eth.getTransactionCount(adminAddress, (err, nonce) => {
            if (err) {
                console.error('Error getting nonce:', err);
                reject(err);
            } else {
                const gasPrice = web3.utils.toWei('10', 'gwei'); // Set the gas price
                const gasLimit = 3000000; // Set the gas limit

                const txObject = {
                    from: adminAddress,
                    to: contractAddress,
                    value: 0,
                    gasPrice: gasPrice,
                    gas: gasLimit,
                    nonce: nonce,
                };

                const data = contract.methods.registerAddress(address).encodeABI();
                console.log(data)
                txObject.data = data;

                web3.eth.accounts.signTransaction(txObject, process.env.PRIVATE_KEY)
                    .then((signedTx) => {
                        web3.eth.sendSignedTransaction(signedTx.rawTransaction)
                            .on('transactionHash', (hash) => {
                                console.log('Transaction hash:', hash);
                                resolve();
                            })
                            .on('error', (error) => {
                                console.log('Error adding address to blockchain:', error);
                                reject(error);
                            });
                    })
                    .catch((error) => {
                        console.log('Error signing transaction:', error);
                        reject(error);
                    });
            }
        });
    });
}
function generateWall() {

    const wallet = cw.generateWallet('ETH')

    return {
        privateKey: wallet.privateKey,
        address: wallet.address,
    };
}

// API endpoint to create a new user and wallet
// api.post('/create/email', (req, res) => {
//     const { name, email, } = req.body;
//     console.log(password)
//     // Create the user in your authentication system
//     // Example: use Firebase Authentication to create a new user
//     admin.auth().createUser({
//         email: email,
//         password: password,
//         displayName: name,
//     })
//         .then((userRecord) => {

//             const user = userRecord.toJSON();
//             // Generate a new wallet for the user
//             const wallet = generateWall();
//             // console.log(wallet)

//             // Save the wallet information to Firestore
//             const walletRef = firestore.collection('users').doc(user.uid);
//             walletRef.set({
//                 name: name,
//                 email: email,
//                 privateKey: wallet.privateKey,
//                 address: wallet.address,
//             })
//                 .then(() => {
//                     addAddressToBlockchain(wallet.address).then(() => {
//                         res.status(200).json({success:true, message: 'User created successfully', wallet: wallet });
//                     })
//                 })
//                 .catch((error) => {
//                     // Handle any Firestore errors
//                     res.status(500).json({ success:false,message: 'Failed to save wallet information' });
//                 });
//         })
//         .catch((error) => {
//             // Handle any authentication errors
//             console.log(error)
//             res.status(500).json({ success:false,message: error.message });
//         });
// });
// api.post('/login', (req, res) => {
//     const { email, password } = req.body;

//     // Authenticate the user using your authentication system
//     // Example: use Firebase Authentication to verify the credentials
//     admin.auth().getUserByEmail(email)
//       .then((userRecord) => {
//         const { uid } = userRecord;

//         // Get the user's wallet information from Firestore
//         const walletRef = firestore.collection('users').doc(uid);
//         walletRef.get()
//         .then((doc) => {
//             if (doc.exists) {
//                 const walletData = doc.data();
//                 // Perform any additional authentication checks as needed
//                 // Example: verify the password

//                 // Generate a JWT token for the user
//                 const token = generateToken(uid);
//                 console.log(token)

//               res.status(200).json({ success:true, token: token, wallet: walletData });
//             } else {
//               res.status(404).json({ success:false, error: 'User not found' });
//             }
//           })
//           .catch((error) => {
//             // Handle any Firestore errors
//             res.status(500).json({ success:false,error: 'Failed to fetch user wallet information' });
//           });
//       })
//       .catch((error) => {
//         // Handle any authentication errors
//         res.status(401).json({success:false, error: 'Invalid credentials' });
//       });
//   });
api.get('/create/admin',(req,res)=>{
    addAddressToBlockchain(process.env.ADMIN_ADDRESS).then(() => {
        res.status(200).json({ success: true, message: 'User created successfully'});
    }) 
})
api.post('/create/store', (req, res) => {
    const { organizationName, organizationEmail, number, licence, addressLine1, addressline2, city, state, country, pincode, website, googleIdToken } = req.body;

    admin.auth().verifyIdToken(googleIdToken)
        .then((decodedToken) => {
            const { sub: googleUserId, email } = decodedToken;

            // Check if the user already exists in your authentication system
            admin.auth().getUser(googleUserId)
                .then((userRecord) => {
                    const user = userRecord.toJSON();

                    // Generate a new wallet for the user
                    const wallet = generateWall();

                    // Save the wallet information to Firestore
                    const walletRef = firestore.collection('users').doc(user.uid);
                    walletRef.set({
                        name: organizationName,
                        phone: number,
                        email: organizationEmail,
                        licence: licence,
                        addressLine1: addressLine1,
                        addressline2: addressline2,
                        city: city,
                        state: state,
                        country: country,
                        pincode: pincode,
                        website: website,
                        isVerified: false,
                        isPending: true,
                        privateKey: wallet.privateKey,
                        address: wallet.address,
                    })
                        .then(() => {
                            addAddressToBlockchain(wallet.address).then(() => {
                                res.status(200).json({ success: true, message: 'User created successfully', wallet: wallet });
                            })
                        })
                        .catch((error) => {
                            // Handle any Firestore errors
                            res.status(500).json({ success: false, error: 'Failed to save wallet information' });
                        });
                })
                .catch((error) => {
                    // Handle the case when the user doesn't exist yet
                    // Create the user in your authentication system
                    admin.auth().createUser({
                        uid: googleUserId,
                        email: email,
                        displayName: name,
                    })
                        .then((userRecord) => {
                            const user = userRecord.toJSON();

                            // Generate a new wallet for the user
                            const wallet = generateWallet();

                            // Save the wallet information to Firestore
                            const walletRef = firestore.collection('users').doc(user.uid);
                            walletRef.set({
                                name: name,
                                email: email,
                                privateKey: wallet.privateKey,
                                mnemonic: wallet.mnemonic,
                            })
                                .then(() => {
                                    addAddressToBlockchain(wallet.address).then(() => {
                                        res.status(200).json({ success: true, message: 'User created successfully', wallet: wallet });
                                    })
                                })
                                .catch((error) => {
                                    // Handle any Firestore errors
                                    res.status(500).json({ success: false, error: 'Failed to save wallet information' });
                                });
                        })
                        .catch((error) => {
                            // Handle any authentication errors
                            res.status(500).json({ success: false, error: 'Failed to create user' });
                        });
                });
        })
        .catch((error) => {
            // Handle any Google ID token verification errors
            res.status(500).json({ success: false, error: 'Failed to verify Google ID token' });
        });
});




module.exports = api;
