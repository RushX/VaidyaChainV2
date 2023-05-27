const express = require('express');
const api = express.Router();
const Web3 = require('web3');
const crypto = require("crypto");
const userApi = require("./users");
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const admin = require('firebase-admin');

const qr = require('qr-image');
const PDFDocument = require('pdfkit');
const fs = require('fs');




dotenv.config();
// const bodyParser = require('body-parser');
const { abi } = require('./CredentialVerificationV3.json');
const { reverse } = require('dns');
const web3 = new Web3(process.env.INFURA_API_KEY); // Replace with your blockchain provider URL
const contractAddress = process.env.CONTRACT_ADDRESS; // Replace with your contract address
const contract = new web3.eth.Contract(abi, contractAddress);
const firestore = admin.firestore();


function issueCertificate(credentialType, degreeName, university, graduationDate, certificateNumber, permanentAddress, doctorName) {
  return new Promise(async (resolve, reject) => {
    const contract = new web3.eth.Contract(abi, contractAddress);
    const adminAddress = process.env.ADMIN_ADDRESS;
    const existingCredentials = await contract.methods.getAllCertificates(adminAddress).call();
    for (let i = 0; i < existingCredentials.length; i++) {
      const credentialId = existingCredentials[i];
      const existingCredential = await contract.methods.credentials(credentialId).call();
      if (existingCredential.licenseNumber === certificateNumber) {
        return reject('Certificate with the same license number already issued');
      }
    }
    web3.eth.getTransactionCount(adminAddress, (err, nonce) => {
      if (err) {
        console.error('Error getting nonce:', err);
        reject(err);
      }
      else {
        const gasPrice = web3.utils.toWei('10', 'gwei'); // Set the gas price
        const gasLimit = 3000000; // Set the gas limit
        const data = contract.methods.registerCredential(credentialType, degreeName, university, graduationDate, certificateNumber, permanentAddress, doctorName).encodeABI();
        const txObject = {
          from: adminAddress,
          to: contractAddress,
          value: 0,
          gasPrice: gasPrice,
          gas: gasLimit,
          nonce: nonce,
        };

        txObject.data = data;

        function getTransactionReceiptWithRetry(hash, maxRetries = 10, retryInterval = 1000) {
          return new Promise((resolve, reject) => {
            let retries = 0;
            function checkReceipt() {
              web3.eth.getTransactionReceipt(hash)
                .then((receipt) => {
                  if (receipt) {
                    resolve(receipt);
                  } else if (retries < maxRetries) {
                    retries++;
                    setTimeout(checkReceipt, retryInterval);
                  } else {
                    reject(new Error('Transaction failed or not mined'));
                  }
                })
                .catch((error) => {
                  reject(error);
                });
            }

            checkReceipt();
          });
        }
        web3.eth.accounts.signTransaction(txObject, process.env.PRIVATE_KEY)
          .then((signedTx) => {
            web3.eth.sendSignedTransaction(signedTx.rawTransaction)
              .on('transactionHash', (hash) => {
                getTransactionReceiptWithRetry(hash)
                  .then((receipt) => {
                    if (receipt.status) {
                      resolve(receipt);
                    } else {
                      console.log(receipt)
                      // Transaction reverted
                      reject('Transaction reverted');
                    }
                  })
                  .catch((error) => {
                    reject(error);
                  });
              })
              .on('error', (error) => {
                // Transaction sending failed
                reject(error);
              });
          })
          .catch((error) => {
            // Signing transaction failed
            reject(error);
          });
      }
    });
  });
}

api.post('/credentials/register', (req, res) => {
  const { authToken, credentialType, degreeName, university, graduationDate, certificateNumber, permanentAddress, doctorName, uid } = req.body;
  admin.auth().verifyIdToken(authToken)
    .then((decodedToken) => {
      issueCertificate(credentialType, degreeName, university, graduationDate, certificateNumber, permanentAddress, doctorName)
        .then(async (result) => {
          const { transactionHash, blockNumber } = result;
          var finalCredId;
          const existingCredentials = await contract.methods.getAllCertificates(process.env.ADMIN_ADDRESS).call();
          for (let i = 0; i < existingCredentials.length; i++) {
            const credentialId = existingCredentials[i];
            const existingCredential = await contract.methods.credentials(credentialId).call();
            if (existingCredential.licenseNumber === certificateNumber) {
              finalCredId = credentialId;
              break;
            }
          }
          const credentialsCollection = firestore.collection('credentials').doc(certificateNumber);

          const credential = {
            credentialId: finalCredId,
            doctorName,
            certificateNumber,
            transactionHash,
            blockNumber,
            isVerified: true
          };
          credentialsCollection.set(credential)
            .then((docRef) => {

              res.json({ success: true, message: 'Credential registered', transantionDetails: { transactionHash, blockNumber } });
            })
            .catch((err) => {
              console.log(err)
              res.json({ success: false, message: err });
            });
        }).catch((err) => {
          const Error = err
          console.log(Error)
          res.json({ success: false, message: Error })
        })
    })
    .catch((error) => {
      res.status(500).json({ success: false, error: error });
    });
});

api.post('/credentials/verify', (req, res) => {
  const { credentialId } = req.body;

  // Call the verifyCredential function of the smart contract
  contract.methods.verifyLicense(credentialId).call({ from: process.env.ADMIN_ADDRESS  })
    .then((isValid) => {
      res.json({ isValid });
    })
    .catch((error) => {
      // Handle any error that occurs during the contract call
      console.error('Failed to verify credential:', error);
      res.status(500).json({ error: 'Failed to verify credential' });
    });
});

api.use('/user', userApi)

api.get('/credentials/all', (req, res) => {
  let resp = []
  const adminAddress = process.env.ADMIN_ADDRESS;
  console.log(adminAddress)
  contract.methods.getAllCertificates(adminAddress).call(async (error, result) => {
    if (error) {
      console.error('Error occurred:', error);
    } else {
      console.log('All certificates:', result);
      for (const certificateId of result) {
        const certificateDetails = await contract.methods.credentials(certificateId).call();
        resp.push(certificateDetails)
        // Process the certificate details as needed
      }
      res.json({ success: true, message: 'All certificates', certificates: resp });
      // Process the result as needed 
    }
  });
})

api.post('/credentials/get', (req, res) => {
  const { licenseNumber } = req.body
  console.log(licenseNumber)
  const credentialsRef = firestore.collection('credentials').doc(licenseNumber);

  credentialsRef.get()
    .then((doc) => {
      if (doc.exists) {
        // Credentials found for the given license number
        const credentials = doc.data();
        res.json(credentials);
      } else {
        // No credentials found for the given license number
        res.status(404).json({ error: 'Credentials not found' });
      }
    })
    .catch((error) => {
      console.error('Error retrieving credentials:', error);
      res.status(500).json({ error: 'Unable to retrieve credentials' });
    });

})


api.post('/credentials/suspend', (req, res) => {
  const gasPrice = web3.utils.toWei('10', 'gwei'); // Set the gas price
  const gasLimit = 3000000; // Set the gas limit
  const {certificateId, certificateNumber } = req.body;

  const credentialsCollection = firestore.collection('credentials').doc(certificateNumber);
  const adminAddress = process.env.ADMIN_ADDRESS;
  web3.eth.getTransactionCount(adminAddress, (err, nonce) => {
    if (err) {
      console.log(err)
      res.json({ success: false, message: err });
    }
    const contract = new web3.eth.Contract(abi, contractAddress);
    const credentialId = certificateId   // Retrieve the credential ID associated with the certificateNumber from your Firestore document
    const data = contract.methods.updateCredentialValidity(credentialId, false).encodeABI();
    const txObject = {
      from: adminAddress,
      to: contractAddress,
      value: 0,
      gasPrice: gasPrice,
      gas: gasLimit,
      nonce: nonce,
    };

    txObject.data = data;
    web3.eth.accounts.signTransaction(txObject, process.env.PRIVATE_KEY)
      .then((signedTx) => {
        web3.eth.sendSignedTransaction(signedTx.rawTransaction)
          .on('transactionHash', (hash) => {
            res.json({ success: true, message: 'Certificate suspended', transactionHash: hash });
          })
      })
  })
    .then(() => {
      credentialsCollection.update({
        isValid: false
      })
        .catch((error) => {
          console.log(error)
          res.json({ success: false, message: error });
        });
    })
    .catch((error) => {
      console.log(error)
      res.json({ success: false, message: error });
    });
});
api.post('/credentials/approve', (req, res) => {
  const gasPrice = web3.utils.toWei('10', 'gwei'); // Set the gas price
  const gasLimit = 3000000; // Set the gas limit
  const {certificateId, certificateNumber } = req.body;

  const credentialsCollection = firestore.collection('credentials').doc(certificateNumber);
  const adminAddress = process.env.ADMIN_ADDRESS;
  web3.eth.getTransactionCount(adminAddress, (err, nonce) => {
    if (err) {
      console.log(err)
      res.json({ success: false, message: err });
    }
    const contract = new web3.eth.Contract(abi, contractAddress);
    const credentialId = certificateId   // Retrieve the credential ID associated with the certificateNumber from your Firestore document
    const data = contract.methods.updateCredentialValidity(credentialId, true).encodeABI();
    const txObject = {
      from: adminAddress,
      to: contractAddress,
      value: 0,
      gasPrice: gasPrice,
      gas: gasLimit,
      nonce: nonce,
    };

    txObject.data = data;
    web3.eth.accounts.signTransaction(txObject, process.env.PRIVATE_KEY)
      .then((signedTx) => {
        web3.eth.sendSignedTransaction(signedTx.rawTransaction)
          .on('transactionHash', (hash) => {
            res.json({ success: true, message: 'Certificate Approved', transactionHash: hash });
          })
      })
  })
    .then(() => {
      credentialsCollection.update({
        isValid: true
      })
        .catch((error) => {
          console.log(error)
          res.json({ success: false, message: error });
        });
    })
    .catch((error) => {
      console.log(error)
      res.json({ success: false, message: error });
    });
});




api.get('/credentials/test', async (req, res) => {
  let resp = []
  const adminAddress = process.env.ADMIN_ADDRESS;
  // Get the latest block number

  // const Web3 = require('web3');

  // Connect to an Ethereum node
  const latestBlockNumber = await web3.eth.getBlockNumber();

  // Specify the block number from where you want to start
  let blockNumber = latestBlockNumber;

  // Keep track of processed blocks to avoid duplicates
  const processedBlocks = new Set();

  // Iterate over each block in reverse order
  while (blockNumber > 0) {
    const block = await web3.eth.getBlock(blockNumber, true);

    // Check if the block has already been processed
    if (processedBlocks.has(blockNumber)) {
      break;
    }

    // Iterate over each transaction in the block
    for (const tx of block.transactions) {
      console.log(tx)
      // Check if the transaction was successful and sent from the adminAddress
      if (tx.status && tx.from.toLowerCase() === adminAddress.toLowerCase()) {
        console.log('Transaction Hash:', tx.hash);
        console.log('Block Number:', tx.blockNumber);
        console.log('Timestamp:', new Date(block.timestamp * 1000));
        console.log('---');
      }
    }

    // Add the block number to the processed blocks set
    processedBlocks.add(blockNumber);

    // Move to the previous block
    blockNumber--;
  }

  // Call the function to get all successful transactions from the adminAddress


})





// Define an endpoint to generate the certificate
api.get('/generate-certificate', async (req, res) => {
  const { licenseNumber } = req.query;
  console.log(licenseNumber);
  const credentialsRef = firestore.collection('credentials').doc(licenseNumber);
  credentialsRef.get()
  .then(async(data) => {
    if (data.exists) {
      // Credentials found for the given license number
      const credentials = data.data();
      console.log(credentials);
      const credId = (credentials.credentialId);
      console.log(credId);
      var Cdata='';
      const certificateDetails = await contract.methods.credentials(credId).call().then((data) => {
        // return(data);
        Cdata=data;
      })


        const templateFile = 'CertificateTemplate.png';

        // Template  details
        const templateName = 'Certificate';

        // License details
        const recipientName = Cdata.doctorName;
        const awardedDegree = Cdata.degreeName;
        const issuingUniversity = Cdata.university;
        const licenseNumber = Cdata.licenseNumber;

        // Read the template file
        const templateBytes = fs.readFileSync(templateFile);

        // Create a new PDF document
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'portrait',
          margin: 0, // Set margin to 0 to fit the template perfectly
        });


        // Set the response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="certificate.pdf"');

        // Pipe the PDF document to the response
        doc.pipe(res);

        // Embed the template as the background of the PDF
        doc.image(templateBytes, {
          fit: [doc.page.width, doc.page.height],
          align: 'center',
          valign: 'center',
        });

        // Set the font style and size for the certificate details
        doc.font('Helvetica-Bold');
        doc.fontSize(18);

        // Position and draw the recipient name
        const recipientNameX = 68;
        const recipientNameY = 272;
        doc.text(recipientName, recipientNameX, recipientNameY);

        // Position and draw the awarded degree
        const awardedDegreeX = 68;
        const awardedDegreeY = 352;
        doc.text(awardedDegree, awardedDegreeX, awardedDegreeY);

        // Position and draw the issuing university
        const issuingUniversityX = 68;
        const issuingUniversityY = 414;
        doc.text(issuingUniversity, issuingUniversityX, issuingUniversityY);

        // Position and draw the license number
        const licenseNumberX = 238;
        const licenseNumberY = 572;
        doc.text(`${issuingUniversity}`, licenseNumberX, licenseNumberY);
        const qrCodeX = 421; // Adjust the X coordinate as needed
        const qrCodeY = 620;
        const qrCodeCanvas = qr.imageSync(`https://${process.env.REACT_HOST}:${process.env.REACT_PORT}/verify/generate-certificate?licenseNumber=${licenseNumber}`, { type: 'png' });
        const license2NumberX = 443;
        const license2NumberY = 752; 
        
        // Draw the QR code onto the PDF document
        doc.image(qrCodeCanvas, qrCodeX, qrCodeY, { width: 131, height: 129 });
        doc.text(`${licenseNumber}`, license2NumberX, license2NumberY);

        doc.end();
      } else {
        // No credentials found for the given license number
        res.status(404).json({ error: 'Credentials not found' });
      }
    })
    .catch((error) => {
      console.error('Error retrieving credentials:', error);
      res.status(500).json({ error: 'Unable to retrieve credentials' });
    });

});









api.get('/', (req, res) => {
  const bearerToken = req.headers.authorization.split(' ')[1];

  // Verify and decode the bearer token
  jwt.verify(bearerToken, 'your-secret-key', (err, decoded) => {
    if (err) {
      // Handle token verification error
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const issuerUid = decoded.sub; // Fetch the issuer UID from the token's 'sub' claim
  })
})




module.exports = api