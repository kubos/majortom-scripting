# `majortom-scripting`
A Node.js library for interacting with Major Tom

## Include the library in your project

```sh
$ npm install majortom-scripting
```

```js
const mts = require('majortom-scripting');

const script = mts({
	host: 'app.majortom.cloud',
	token: '<your script token>',
	mission: '<optional mission ID>',
});
```

## API

#### `mts(options: object): MajortomScript`
Instantiates the Major Top Script singleton

`options: object`
* `host: string` The host name where your Major Tom instance is running
* `token: string` Your script's unique token
* `mission?: string|number` Optionally set the mission ID on instantiation

## `MajortomScript`

#### `MajortomScript.getMissionId(): Promise<number>`
Retrieve the ID of the mission that this script is interacting with

#### `MajortomScript.getSatellite(input: object): Promise<Satellite>`
Retrieve a Satellite object using one of name, database ID, or NORAD ID

`input: object`
* `name?: string` The unique satellite name in Major Tom
* `id?: string|number` The Major Tom database ID; can be found in the Major Tom url
* `noradId?: string|number` The satellite's NORAD ID

#### `MajortomScript.getCommandDefinitions(satellite: Satellite): Promise<CommandDefinition[]>`
Retrieve all the command definitions for the passed satellite

#### `MajortomScript.createCommand(input: object): Promise<Command>`
Create a command object that can be queued and executed later

`input: object`
* `system: Satellite` The satellite to command
* `command: string|Command` Either a command object or the command definition type string
* `fields?: object.<string, number|string>` Optional object for command parameter values; the keys are field names and values are field values for this command
* `gateway?: string|number|Gateway` Optionally identify the gateway to send this command by name, database ID, or as a Gateway object

#### `MajortomScript.executeCommand(command: Command): Promise<Command>`
Execute the passed command; resolves as soon as the execution command is sent to Major Tom

#### `MajortomScript.getGateway(input: object): Promise<Gateway>`
Retrieve a gateway from Major Tom by either name or id

`input: object`
* `name?: string` The unique gateway name
* `id?: string|number` The database ID of the gateway

#### `MajortomScript.queueCommand(command: Command): Promise<Command>`
Instruct Major Tom to queue the command; resolves the updated Command object

#### `MajortomScript.executeAndCompleteCommand(command: Command, maxWaitTime?: number): Promise<Command>`
Instruct Major Tom to execute the command; resolves the updated Command object after Major Tom has updated the command state to `"completed"`, `"failed"`, or `"cancelled"`. Optional argument `maxWaitTime: number` defaults to 90 seconds.

#### `MajortomScript.executeCommandsInSequence(commands: Command[], options?: object): Promise<Command[]>`
Executes the passed array of commands in sequence, only proceeding to the next command if the first one resolves to a `"completed"`, `"failed"`, or `"cancelled"` state.

`options?: object`
Some aspects of the method's behavior can be defined:
* `maxWaitTime: number` The maximum time to wait for each command to resolve; defaults to 90 seconds
* `continuePastFailures: boolean` If true, will continue attempting to execute each command even if the command times out or resolves to `"failed"` or `"cancelled"`

## `Satellite`

#### `Satellite.getQueuedCommands(): Promise<Command[]>`
Resolves an Array of all queued Command objects for the Satellite

#### `Satellite.getRemoteFiles(): Promise<any[]>`
Resolves the list of remote files from the Satellite

#### `Satellite.getStagedFiles(): Promise<any[]>`
Resolves the list of all files staged in Major Tom for uplink to the Satellite

#### `Satellite.getRecentSystemEvents(options?: object): Promise<EventObject[]>`
Resolves a list of events in Major Tom related to this system for a given time period

`options?: object`
* `hours: number` The number of hours back to search for events
* `ending: number` The number of hours ago to start searching back
* `type: string|string[]` One or more event types to include in the results
* `level: string|string[]` One or more event levels to include in the results

For example, submitting an `options` object `{ hours: 10, ending: 5 }` will return any events for the system that occurred betweein 15 hours ago and 5 hours ago.

#### `Satellite.getNextAvailablePass(groundStationId?: number|string): Promise<Pass|null>`
Retrieves the next available pass for this satellite. If `groundStationId` is provided, retrieves the next available pass for this satellite over the identified ground station.

`groundStationId?: number|string` The database ID of the ground station to filter for

#### `Satellite.getNextPass(groundStationId?: number|string): Promise<Pass|null>`
Retrieves the next pass for the satellite, whether scheduled, available, or in any other state. If `groundStationId` is provided, retrieves the next pass in any state for this satellite over the identified ground station.

`groundStationId?: number|string` The database ID of the ground station to filter for

## `Command`

#### `Command.setGateway(gateway: number|Gateway): Command`
Associate the command with a gateway using either the gateway database ID or a Gateway object

#### `Command.setIsQueued(): Command`
Sets the command state to "queued"

#### `Command.setId(number): Command`
Sets the command id

#### `Command.setFinalState(string): Command`
Sets the command's final state

#### `Command.toString(): string`
Returns a string representation of the command's important properties, formatted for use by the script library's GQL queries

#### `Command.getVariables(): object.<string, number|string>`
Returns an object representation of the command's important properties, formatted for use by the script library's GQL mutations

### `Command` Properties
##### `systemId: number|string` The id of the command's system
##### `commandDefinitionId: number|string` The id of the command's command definition
##### `fields: string` A JSON string representing the command's field values
##### `gatewayId: number|string` The id of the command's gateway
##### `id: number|string` The database id for this command
##### `state: string` The current command state
##### `status: string (Read Only)` The command's most recent known Major Tom status
##### `output: string (Read Only)` The command's most recent known Major Tom output
##### `payload: string (Read Only)` The command's most recent known Major Tom payload

## `Gateway`

#### `Gateway.getRecentCommands(options?: object): Promise<Command[]>`
Resolves a list of commands in Major Tom sent through this gateway for a given time period
`options?: object`
* `hours: number` The number of hours back to search for commands
* `ending: number` The number of hours ago to start searching back
* `type: string|string[]` One or more command types to include in the results

For example, submitting an `options` object `{ hours: 10, ending: 5 }` will return any commands sent through this gateway that occurred betweein 15 hours ago and 5 hours ago.

## `Pass`

### `Pass` Properties
##### `id: number|string` The pass's database ID
##### `duration: number` The pass's duration in milliseconds
##### `start: number` The pass's start in milliseconds from UNIX epoch
##### `end: number` The pass's end in milliseconds from UNIX epoch
##### `groundStationId: number|string` The pass's groundstation's database ID
##### `satelliteId: number|string` The pass's satellite's database ID
##### `scheduledStatus: string` The pass's last known Major Tom scheduled status

## `EventObject`

### `EventObject` Properties

##### `id: number` The event's database ID
##### `debug: string` The event's debug string
##### `message: string` The event's message
##### `timestamp: number` The event's timestamp in milliseconds from UNIX epoch
##### `type: string` The event's type
##### `level: string` The event's level
##### `commandId: number` The command associated with the event, if any
##### `createdAt: number` The timestamp of the event's creation in milliseconds from UNIX epoch

## `CommandDefinition`

### `CommandDefinition` Properties
##### `id: string` The command definition's database ID
##### `commandType: string` The command definition's type string
##### `displayName: string` The command definition's display name
##### `description: string` The command description
##### `tags: string[]` The list of command tags
##### `fields: Field[]` The field objects for this command

## Field

### `Field` Properties

##### `name: string` The name of the command field
##### `type: "integer"|"float"|"enum"|"string"|"text"|"datetime"|"boolean"` One of the field type descriptors
##### `value?: string|number` A constant value that the field must always take
##### `default?: string|number` The default, placeholder, or starting value for a field that can be changed
##### `characterLimit?: number` A number indicating the character limit for a string or text field
##### `range?: number[]|string[]`
##### `enum?: object.<string, number>` An object whose keys are string descriptions of their integer values. Values do not need to be sequential. Required if type is enum, ignored otherwise.