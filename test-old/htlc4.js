const { assertEqualBN } = require('./helper/assert');
const truffleAssert = require('truffle-assertions');

const {
  bufToStr,
  getBalance,
  htlcArrayToObj,
  isSha256Hash,
  newSecretHashPair,
  nowSeconds,
  random32,
  txContractId,
  txGas,
  txLoggedArgs,
} = require('./helper/utils')

// const HashedTimelock = artifacts.require('./HashedTimelock.sol')
const HashedTimelockEps = artifacts.require('./HashedTimelockEps.sol')

const REQUIRE_FAILED_MSG = 'Returned error: VM Exception while processing transaction: revert'

const hourSeconds = 3600
const timeLock1Hour = nowSeconds() + hourSeconds
const oneFinney = web3.utils.toWei(web3.utils.toBN(1), 'finney')

contract('HashedTimelock: modifier check (both EPS-converted)', accounts => {
  const sender = accounts[1]
  const receiver = accounts[2]

  it('withdraw() success case', async () => {
    const { StateMachine } = require('./StateMachine.js')
    const hashPair = newSecretHashPair()
    const htlc = await HashedTimelockEps.deployed()

    let newContractTx
    let contractId
    let receiverBalBefore
    let withdrawTx

    class Client extends StateMachine {
      constructor() {
        super()
      }

      async newContract() {
        console.log('newContract')
        newContractTx = await htlc.newContract(
          receiver,
          hashPair.hash,
          timeLock1Hour,
          {
            from: sender,
            value: oneFinney,
          }
        )
        contractId = txContractId(newContractTx)
        receiverBalBefore = await getBalance(receiver)
        this.raise('withdraw')
      }

      async withdraw() {
        console.log('withdraw')
        try {
          // receiver calls withdraw with the secret to get the funds
          withdrawTx = await htlc.withdraw(contractId, hashPair.secret, {
            from: receiver,
          })
          this.raise('withdraw_end')
        } catch (e) {
          this.raise('withdraw_err')
        }
      }

      async withdraw_end() {
        console.log('withdraw_end')
        const tx = await web3.eth.getTransaction(withdrawTx.tx)
        // Check contract funds are now at the receiver address
        const expectedBal = receiverBalBefore
          .add(oneFinney)
          .sub(txGas(withdrawTx, tx.gasPrice))
        assertEqualBN(
          await getBalance(receiver),
          expectedBal,
          "receiver balance doesn't match"
        )
        const contractArr = await htlc.getContract.call(contractId)
        const contract = htlcArrayToObj(contractArr)
        assert.isTrue(contract.withdrawn) // withdrawn set
        assert.isFalse(contract.refunded) // refunded still false
        assert.equal(contract.preimage, hashPair.secret)
      }
    }

    const client = new Client()
    client.raise('newContract')
    await client.loop()
  })
})
