const HashedTimelock = artifacts.require('./HashedTimelock.sol')
// const HashedTimelockERC20 = artifacts.require('./HashedTimelockERC20.sol')
// const HashedTimelockERC721 = artifacts.require('./HashedTimelockERC721.sol')

module.exports = function (deployer) {
  deployer.deploy(HashedTimelock)
  // deployer.deploy(artifacts.require('./HashedTimelockEps.sol'))
  deployer.deploy(artifacts.require('./Sec_HashedTimelock.sol'))
  deployer.deploy(artifacts.require('./Cash_HashedTimelock.sol'))
  // deployer.deploy(HashedTimelockERC20)
  // deployer.deploy(HashedTimelockERC721)
}
