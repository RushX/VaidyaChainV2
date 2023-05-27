const express = require('express');
const Web3 = require('web3');
const bodyParser = require('body-parser');
const cors=require('cors');
const userRoutes = require('./routes/users.js');
const apiRoutes = require('./routes/api.js');
const app=express()
const port=5000
app.use(bodyParser.json());
app.use(cors());
app.use('/api', apiRoutes);
const web3 = new Web3('http://localhost:8545'); // Replace with your blockchain node URL

// app.use('/users',userRoutes)c
app.post('/',(req,res)=>{
    console.log(req.body)
    res.send("Hello")
})


// Signup
app.listen(port,()=>console.log(`SERVER RUNNING ON PORT http://localhost:${port}`))