// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CredentialVerificationSystem {
    struct Credential {
        uint256 id;
        string credentialType;
        string degreeName;
        string university;
        string graduationDate;
        string licenseNumber;
        bool isValid;
        address issuer;
    }

    mapping(uint256 => Credential) public cred;
    mapping(string => bool) public uniqueLicenseNumbers; // Mapping to track unique license numbers
    uint256 public credentialCounter;

    mapping(address => mapping(uint256 => bool)) public credentialAccess;

    event CredentialRegistered(uint256 credentialId);
    event CredentialUpdated(uint256 credentialId);
    event CredentialAccessGranted(uint256 credentialId, address user);
    event CredentialAccessRevoked(uint256 credentialId, address user);

    modifier onlyIssuer(uint256 credentialId) {
        require(
            cred[credentialId].issuer == msg.sender,
            "Only issuer can perform this action"
        );
        _;
    }

    modifier onlyValidCredential(uint256 credentialId) {
        require(cred[credentialId].isValid, "Invalid credential");
        _;
    }

    modifier onlyAuthorizedUser(uint256 credentialId) {
        require(
            cred[credentialId].issuer == msg.sender ||
                credentialAccess[msg.sender][credentialId],
            "Unauthorized user"
        );
        _;
    }

    function registerCredential(
        string memory credentialType,
        string memory degreeName,
        string memory university,
        string memory graduationDate,
        string memory licenseNumber
    ) public returns (uint256) {
        require(
            !uniqueLicenseNumbers[licenseNumber],
            "License number already exists"
        ); // Check for uniqueness
        credentialCounter++;
        Credential memory newCredential = Credential(
            credentialCounter,
            credentialType,
            degreeName,
            university,
            graduationDate,
            licenseNumber,
            true,
            msg.sender
        );
        cred[credentialCounter] = newCredential;
        uniqueLicenseNumbers[licenseNumber] = true; // Mark the license number as used
        emit CredentialRegistered(credentialCounter);
        return credentialCounter;
    }

    function updateCredentialValidity(
        uint256 credentialId,
        bool isValid
    ) public onlyIssuer(credentialId) {
        cred[credentialId].isValid = isValid;
        emit CredentialUpdated(credentialId);
    }

    function grantCredentialAccess(
        uint256 credentialId,
        address user
    ) public onlyIssuer(credentialId) {
        credentialAccess[user][credentialId] = true;
        emit CredentialAccessGranted(credentialId, user);
    }

    function revokeCredentialAccess(
        uint256 credentialId,
        address user
    ) public onlyIssuer(credentialId) {
        delete credentialAccess[user][credentialId];
        emit CredentialAccessRevoked(credentialId, user);
    }

    function verifyLicense(
        string memory licenseNumber
    ) public view returns (bool) {
        for (uint256 i = 1; i <= credentialCounter; i++) {
            if (
                keccak256(bytes(cred[i].credentialType)) ==
                keccak256(bytes("License")) &&
                keccak256(bytes(cred[i].licenseNumber )) ==
                keccak256(bytes(licenseNumber))
            ) {
                return cred[i].isValid;
            }
        }
        return false;
    }
}
