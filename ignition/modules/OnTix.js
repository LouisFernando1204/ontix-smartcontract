const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const OnTixModule = buildModule("OnTixModule", (m) => {
    const onTix = m.contract("OnTix");

    return { onTix };
});

module.exports = OnTixModule;