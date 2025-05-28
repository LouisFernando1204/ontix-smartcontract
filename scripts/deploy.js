const { ethers } = require("hardhat");

async function main() {
    const OnTix = await ethers.getContractFactory('OnTix');

    console.log('Deploying OnTix...');
    const onTix = await OnTix.deploy();
    await onTix.waitForDeployment();

    console.log(`OnTix deployed to: ${onTix.target}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });