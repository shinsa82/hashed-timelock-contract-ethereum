pragma solidity ^0.5.0;

contract StateMachine {
    struct Transition {
        uint from;
        uint to;
    }

    uint state;
    Transition[] transitionsArray;

    modifier init(uint q) {
        _;
        state = q;
    }

    modifier transitions(uint current, uint next) {
        require(state == current, "state pre-condition violated");
        state = next;
        _;
    }
}
