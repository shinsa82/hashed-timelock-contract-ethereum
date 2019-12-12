const { assertEqualBN } = require('./helper/assert');
const delay = require('delay') // promisified setTimeout
const {
  bufToStr,
  htlcERC20ArrayToObj,
  isSha256Hash,
  newSecretHashPair,
  nowSeconds,
  random32,
  txContractId,
  txLoggedArgs,
} = require('./helper/utils');
// const promisify = require('util').promisify;
// const sleep = promisify(require('timers').setTimeout);
const truffleAssert = require('truffle-assertions');

const HashedTimelockEps = artifacts.require('./HashedTimelockEps.sol')
// const HashedTimelockERC20 = artifacts.require('./HashedTimelockERC20.sol')
// const AliceERC20TokenContract = artifacts.require('./helper/AliceERC20.sol')
// const BobERC20TokenContract = artifacts.require('./helper/BobERC20.sol')


contract('HashedTimelock DvP', accounts => {
  const Seller = accounts[1] // owner of AliceERC20 and wants swap for BobERC20
  const Buyer = accounts[2] // owner of BobERC20 and wants to swap for AliceERC20

  const oneFinney = web3.utils.toWei(web3.utils.toBN(1), 'finney')
  const tokenSupply = 1000
  const senderInitialBalance = 100
  const tokenAmount = 5

  // some testing data
  let timeLockSeconds
  let htlc
  let Security
  let Cash
  let hashPair // shared b/w the two swap contracts in both directions
  let a2bSwapId // swap contract ID for Alice -> Bob in the AliceERC20
  let b2aSwapId // swap contract ID for Bob -> Alice in the BobERC20
  // use a variable to track the secret Bob will have learned from Alice's withdraw transaction
  // to make the flow more explicitly reflect the real world sequence of events
  let learnedSecret

  it('Step 1: Alice sets up a swap with Bob in the AliceERC20 contract', async () => {

    Security = await HashedTimelockEps.new()
    Cash = await HashedTimelockEps.new()
    hashPair = newSecretHashPair()

    timeLockSeconds = nowSeconds() + 2

    console.log('newContract')
    newContractTx = await Security.newContract(
      Buyer,
      hashPair.hash,
      timeLockSeconds,
      {
        from: Seller,
        value: oneFinney,
      }
    )
    a2bSwapId = txContractId(newContractTx)
    // receiverBalBefore = await getBalance(receiver)
    // this.raise('withdraw')

    timeLockSeconds = nowSeconds() + 1
    // const newSwapTx = await newSwap(BobERC20, htlc, { hashlock: hashPair.hash, timelock: timeLockSeconds }, Bob, Alice)

    newContractTx = await Cash.newContract(
      Seller,
      hashPair.hash,
      timeLockSeconds,
      {
        from: Buyer,
        value: oneFinney,
      }
    )
    b2aSwapId = txContractId(newContractTx)

    withdrawTx = await Cash.withdraw(b2aSwapId, hashPair.secret, {
      from: Buyer,
    })

    learnedSecret = hashPair.secret

    withdrawTx = await Security.withdraw(a2bSwapId, hashPair.secret, {
      from: Seller,
    })
  })
/*
  describe("Test the refund scenario:", () => {
    const currentBalanceAlice = senderInitialBalance - tokenAmount;
    const currentBalanceBob = senderInitialBalance - tokenAmount;

    it('the swap is set up with 5sec timeout on both sides', async () => {
      timeLockSeconds = nowSeconds() + 3
      let newSwapTx = await newSwap(AliceERC20, htlc, { hashlock: hashPair.hash, timelock: timeLockSeconds }, Alice, Bob)
      a2bSwapId = txContractId(newSwapTx);

      newSwapTx = await newSwap(BobERC20, htlc, { hashlock: hashPair.hash, timelock: timeLockSeconds }, Bob, Alice)
      b2aSwapId = txContractId(newSwapTx)

      await assertTokenBal(AliceERC20, htlc.address, tokenAmount);
      await assertTokenBal(BobERC20, htlc.address, tokenAmount);

      await sleep(3000);

      // after the timeout expiry Alice calls refund() to get her tokens back
      let result = await htlc.refund(a2bSwapId, {
        from: Alice
      });

      // verify the event was emitted
      truffleAssert.eventEmitted(result, 'HTLCERC20Refund', ev => {
        return ev.contractId === a2bSwapId;
      }, `Refunded Alice`);

      await assertTokenBal(AliceERC20, Alice, currentBalanceAlice);

      // Bob can also get his tokens back by calling refund()
      result = await htlc.refund(b2aSwapId, {
        from: Bob
      });

      // verify the event was emitted
      truffleAssert.eventEmitted(result, 'HTLCERC20Refund', ev => {
        return ev.contractId === b2aSwapId;
      }, `Refunded Bob`);

      await assertTokenBal(BobERC20, Bob, currentBalanceBob);
    });
  })

  const newSwap = async (token, htlc, config, initiator, counterparty) => {
    // initiator of the swap has to first designate the swap contract as a spender of his/her money
    // with allowance matching the swap amount
    await token.approve(htlc.address, tokenAmount, { from: initiator })
    return htlc.newContract(
      counterparty,
      config.hashlock,
      config.timelock,
      token.address,
      tokenAmount,
      {
        from: initiator,
      }
    )
  }
  */
});
