pragma solidity ^0.5.0;

import "./StateMachine.sol";

/**
 * @title Hashed Timelock Contracts (HTLCs) on Ethereum ETH.
 *
 * This contract provides a way to create and keep HTLCs for ETH.
 *
 * See HashedTimelockERC20.sol for a contract that provides the same functions
 * for ERC20 tokens.
 *
 * Protocol:
 *
 *  1) newContract(receiver, hashlock, timelock) - a sender calls this to create
 *      a new HTLC and gets back a 32 byte contract id
 *  2) withdraw(contractId, preimage) - once the receiver knows the preimage of
 *      the hashlock hash they can claim the ETH with this function
 *  3) refund() - after timelock has expired and if the receiver did not
 *      withdraw funds the sender / creator of the HTLC can get their ETH
 *      back with this function.
 */
contract Cash_HashedTimelock is StateMachine {

    event LogHTLCNew(
        bytes32 indexed contractId,
        address indexed sender,
        address indexed receiver,
        uint amount,
        bytes32 hashlock,
        uint timelock
    );
    event LogHTLCWithdraw(bytes32 indexed contractId);
    event LogHTLCRefund(bytes32 indexed contractId);
    event withdraw_end();
    event withdraw_err();
    event refund_end();
    event refund_err();

    struct LockContract {
        address payable sender;
        address payable receiver;
        uint amount;
        bytes32 hashlock; // sha-2 sha256 hash
        uint timelock; // UNIX timestamp seconds - locked UNTIL this time
        bool withdrawn;
        bool refunded;
        bytes32 preimage;
    }

    modifier fundsSent() {
        require(msg.value > 0, "msg.value must be > 0");
        _;
    }
    modifier futureTimelock(uint _time) {
        // only requirement is the timelock time is after the last blocktime (now).
        // probably want something a bit further in the future then this.
        // but this is still a useful sanity check:
        require(_time > now, "timelock time must be in the future");
        _;
    }
    modifier contractExists(bytes32 _contractId) {
        require(haveContract(_contractId), "contractId does not exist");
        _;
    }
    modifier hashlockMatches(bytes32 _contractId, bytes32 _x) {
        require(
            contracts[_contractId].hashlock == sha256(abi.encodePacked(_x)),
            "hashlock hash does not match"
        );
        _;
    }
    modifier withdrawable(bytes32 _contractId) {
        require(contracts[_contractId].receiver == msg.sender, "withdrawable: not receiver");
        require(contracts[_contractId].withdrawn == false, "withdrawable: already withdrawn");
        require(contracts[_contractId].timelock > now, "withdrawable: timelock time must be in the future");
        _;
    }
    function _withdrawable(bytes32 _contractId) internal returns (bool) {
        return
            contracts[_contractId].receiver == msg.sender &&
            contracts[_contractId].withdrawn == false &&
            contracts[_contractId].timelock > now;
    }
    modifier refundable(bytes32 _contractId) {
        require(contracts[_contractId].sender == msg.sender, "refundable: not sender");
        require(contracts[_contractId].refunded == false, "refundable: already refunded");
        require(contracts[_contractId].withdrawn == false, "refundable: already withdrawn");
        require(contracts[_contractId].timelock <= now, "refundable: timelock not yet passed");
        _;
    }
    function _refundable(bytes32 _contractId) internal returns (bool) {
        return 
            contracts[_contractId].sender == msg.sender &&
            contracts[_contractId].refunded == false &&
            contracts[_contractId].withdrawn == false &&
            contracts[_contractId].timelock <= now;
    }

    mapping (bytes32 => LockContract) contracts;

    /**
     * constructor added by transpilation
     */
    constructor() public init(2) atState(2){}

    /**
     * @dev Sender sets up a new hash time lock contract depositing the ETH and
     * providing the reciever lock terms.
     *
     * @param _receiver Receiver of the ETH.
     * @param _hashlock A sha-2 sha256 hash hashlock.
     * @param _timelock UNIX epoch seconds time that the lock expires at.
     *                  Refunds can be made after this time.
     * @return contractId Id of the new HTLC. This is needed for subsequent
     *                    calls.
     */
    function cash_newContract(address payable _receiver, bytes32 _hashlock, uint _timelock)
        external
        payable
        fundsSent
        futureTimelock(_timelock)
        atStates([4,0,0,0])
        transition(4,5)

        returns (bytes32 contractId)
    {
        contractId = sha256(
            abi.encodePacked(
                msg.sender,
                _receiver,
                msg.value,
                _hashlock,
                _timelock
            )
        );

        // Reject if a contract already exists with the same parameters. The
        // sender must change one of these parameters to create a new distinct
        // contract.
        if (haveContract(contractId))
            revert("Contract already exists");

        contracts[contractId] = LockContract(
            msg.sender,
            _receiver,
            msg.value,
            _hashlock,
            _timelock,
            false,
            false,
            0x0
        );

        emit LogHTLCNew(
            contractId,
            msg.sender,
            _receiver,
            msg.value,
            _hashlock,
            _timelock
        );
    }

    function sec_newContract()
        external
        payable
        atStates([2,0,0,0])
        transition(2,4)
    {}


    /**
     * @dev Called by the receiver once they know the preimage of the hashlock.
     * This will transfer the locked funds to their address.
     *
     * @param _contractId Id of the HTLC.
     * @param _preimage sha256(_preimage) should equal the contract hashlock.
     * @return bool true on success
     */
    function cash_withdraw(bytes32 _contractId, bytes32 _preimage)
        external
        contractExists(_contractId)
        hashlockMatches(_contractId, _preimage)
        // withdrawable(_contractId)
        atStates([5,0,0,0])
        transition(5,6)
        returns (bool)
    {
        if (!_withdrawable(_contractId)) {
            withdrawErr();
        } else {
            LockContract storage c = contracts[_contractId];
            c.preimage = _preimage;
            c.withdrawn = true;
            c.receiver.transfer(c.amount);
            emit LogHTLCWithdraw(_contractId);
            withdrawEnd();
            return true;
        }
    }

    function withdrawEnd() internal atStates([6,0,0,0]) transition(6,8) {
        emit withdraw_end();

    }

    function withdrawErr() internal atStates([6,0,0,0]) transition(6,7) {
        emit withdraw_err();
    }

    function sec_withdraw()
        external
        atStates([8,0,0,0])
        transition(8,10)
    {}

    function sec_withdraw_end()
        external
        atStates([10,0,0,0])
        transition(10,12)
    {}

    /**
     * @dev Called by the sender if there was no withdraw AND the time lock has
     * expired. This will refund the contract amount.
     *
     * @param _contractId Id of HTLC to refund from.
     * @return bool true on success
     */
    function cash_refund(bytes32 _contractId)
        external
        contractExists(_contractId)
        refundable(_contractId)
        atStates([7,0,0,0])
        transition(7,9)
        returns (bool)
    {
        LockContract storage c = contracts[_contractId];
        c.refunded = true;
        c.sender.transfer(c.amount);
        emit LogHTLCRefund(_contractId);
        refundEnd();
        return true;
    }

    function refundEnd() internal atStates([9,0,0,0]) transition(9,11) {
        emit refund_end();

    }

    function sec_refund()
        external
        // contractExists(_contractId)
        // hashlockMatches(_contractId, _preimage)
        // withdrawable(_contractId)
        atStates([11,0,0,0])
        transition(11,13)
    {}

    function sec_refund_end()
        external
        // contractExists(_contractId)
        // hashlockMatches(_contractId, _preimage)
        // withdrawable(_contractId)
        atStates([13,0,0,0])
        transition(13,12)
    {}

    /**
     * @dev Get contract details.
     * @param _contractId HTLC contract id
     * @return All parameters in struct LockContract for _contractId HTLC
     */
    function getContract(bytes32 _contractId)
        public
        view
        returns (
            address sender,
            address receiver,
            uint amount,
            bytes32 hashlock,
            uint timelock,
            bool withdrawn,
            bool refunded,
            bytes32 preimage
        )
    {
        if (haveContract(_contractId) == false)
            return (address(0), address(0), 0, 0, 0, false, false, 0);
        LockContract storage c = contracts[_contractId];
        return (
            c.sender,
            c.receiver,
            c.amount,
            c.hashlock,
            c.timelock,
            c.withdrawn,
            c.refunded,
            c.preimage
        );
    }

    /**
     * @dev Is there a contract with id _contractId.
     * @param _contractId Id into contracts mapping.
     */
    function haveContract(bytes32 _contractId)
        internal
        view
        returns (bool exists)
    {
        exists = (contracts[_contractId].sender != address(0));
    }

}
