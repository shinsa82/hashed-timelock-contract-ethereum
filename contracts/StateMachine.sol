pragma solidity ^0.5.0;

contract StateMachine {
    uint8 state;

    modifier init(uint8 q) {
        state = q;
        _;
    }

    modifier transition(uint8 from, uint8 to) {
        require(state == from, "state pre-condition violated");
        if (state == from) {
            state = to;
        }
        _;
    }

    modifier atStates(uint8[4] memory qs) {
        require(state == qs[0] || state == qs[1] || state == qs[2] || state == qs[3],
            "state does not match with any of specified states");
        _;
    }

    modifier atState(uint8 q) {
        require(state == q, "state precondition failed");
        _;
    }
}
