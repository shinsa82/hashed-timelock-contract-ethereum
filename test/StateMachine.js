class StateMachine {
    constructor() {
        this.events = []
    }

    raise(ev, arg) {
        this.events.push({ ev, arg })
    }

    async loop() {
        while (this.events.length > 0) {
            const { ev, arg } = this.events.shift()
            // console.log(ev)
            await this[ev](arg)
        }
    }
}

module.exports = { StateMachine }