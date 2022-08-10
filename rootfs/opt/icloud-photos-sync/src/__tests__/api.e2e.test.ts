describe('API E2E Tests', () => {
    test.todo('Only run if trust token is available and valid')
    test.todo('Setup test icloud account')
    test.todo('Keep iCloud Account in state and check if calls continue to work as expected')
    test.todo('We need the remote assets + folder state')
    const token = "asdf"

    if(token) {
        describe('Login flow', () => {
            test.todo('Login flow without token')
            test.todo('Login flow with token')
        })
        describe('Fetching records', () => {
            test.todo('Fetch all records')
            test.todo('Fetch records of one album')
        })
        describe('Fetching albums', () => {
            test.todo('Fetch one album')
            test.todo('Fetch all albums')
        })
        describe('Deleting records', () => {
            test.todo('Delete a record - How to restore state afterwards??')
        })
    }
})