import fs from 'fs'
import xml2js from 'xml2js';
import osd from "object-assign-deep";
const objectAssignDeep = (a, ...b) => (osd.withOptions(a,b,{arrayBehaviour: 'merge'}))
const parser = new xml2js.Parser({trim: true, explicitArray: true});

function deepReplaceMatch(obj, testVal, testProp, cb, id) {
    const keys = Object.keys(obj)
    for (let i = 0, len = keys.length; i < len; i++) {
        const prop = keys[i], val = obj[prop]
        if ((!testVal || testVal(val)) && (!testProp || testProp(prop))) cb({val, prop, obj, id})
        if (val && typeof val === 'object') deepReplaceMatch(val, testVal, testProp, cb, prop)
    }
}



function parseEntityString(entityString){

    let stri = 0;
    let incl = 0;
    let start = -1
    let end = -1
    let incl2 = 0
    let start2 = -1
    let end2 = -1
    let other = false
    let filter = false
    let field = entityString
    let filter2 = false
    let partEnded = false
    let otherstart = -1
    while(entityString[stri]){
        if(entityString[stri] === "." && !incl){
            other = entityString.substring(stri + 1)
            otherstart = stri + 1
            partEnded = true;
            if(field.length > stri){
                field = field.substr(0,stri)
            }
        }
        if(entityString[stri] === "{"){
            if(!incl && !incl2 && !partEnded) {
                start = stri
                field = field.substr(0,stri)
            }
            incl++
        }
        else if(entityString[stri] === "}"){
            incl--
            if(!incl && !incl2 && !partEnded) {
                end = stri
                filter = entityString.substring(start+1,end)
            }
        }
        else if(entityString[stri] === "("){
            if(!incl && !incl2) {
                start2 = stri
                field = field.substr(0,stri)
                if(otherstart !== -1){
                    other = entityString.substring(otherstart, stri )
                }
            }
            incl2++
        }
        else if(entityString[stri] === ")"){
            incl2--
            if(!incl && !incl2) {
                end2 = stri
                filter2 = entityString.substring(start2+1,end2)
            }
        }
        stri++
    }

    return {
        otherParts: other,
        filterExpression: filter,
        entityFieldType: field,
        keyField: filter2
    }
}

function getFilteredInstances(Instance,entityString){

    let results = []
    if(entityString.includes(",")){
        entityString.split(",").forEach(part => {
            results.push(...getFilteredInstances(Instance,part))
        })
        return results
    }

    let {entityFieldType, filterExpression, otherParts,keyField} = parseEntityString(entityString)


    let entities = getChildEntities(Instance,entityFieldType)

    if(entities?.length){
        for(let subInstance of entities){
            if(filterExpression){
                let [filterField, filterValue] = filterExpression.split("=")
                let filterResult = getFilteredInstances(subInstance,filterField)
                //{value: "1"}
                if(filterResult[0]?.$.value !== filterValue){
                    continue
                }
                 else{
                    let x = 4
                }
            }
            if(otherParts){
                let subResult = getFilteredInstances(subInstance,otherParts)
                results.push(...subResult)
            }
            else {
                results.push(subInstance)
            }
        }
    }
    return results
}

function getChildEntities(Instance, resultFieldName){

    return Instance[resultFieldName] || Instance.$?.[resultFieldName] && [{$: {value: Instance.$?.[resultFieldName]}}]
}

function parseField(field){
    let [match, resultFieldName, query] = field.match(/(\w+)(?::(.*))?/)
    return {match,resultFieldName, query}
}

function AssignData(target, Instance, structure){
    for(let field in structure) {
        let {resultFieldName, query} = parseField(field)

        let entities;
        if (query) {
            entities = getFilteredInstances(Instance, query)
        } else {
            entities = getChildEntities(Instance, resultFieldName)
        }
        if(!entities?.length)continue

        if(structure[field].constructor === Object){
            let forcedKey = query && parseEntityString(query).keyField;
            let key = forcedKey || 'index'


            let editedEntity = target[resultFieldName]
            if(!editedEntity){
                editedEntity = {}
                target[resultFieldName] = editedEntity
            }

            for(let entity of entities) {

                let keyValue = entity.$?.[key]
                if(!keyValue){
                    if(forcedKey){
                        continue
                    }
                    keyValue = 0
                    while( editedEntity[keyValue])keyValue++
                }

                if(!editedEntity[keyValue]) editedEntity[keyValue] = {}
                if(entity.$?.removed){
                    delete editedEntity[keyValue]
                }
                else{
                    AssignData(editedEntity[keyValue], entity, structure[field])
                }

            }
        }
        else if(structure[field].constructor === Array){
            if(!target[resultFieldName]){
                target[resultFieldName] = []
            }
            for(let entity of entities){
                let result;
                if(structure[field][0].constructor !== Object){
                    let obj = {}
                    AssignData(obj, entity, {value: structure[field][0]})
                    result = obj.value
                }
                else{
                    let obj = {}
                    AssignData(obj, entity, structure[field][0])
                    if(entity.$?.index)obj.index = +entity.$.index
                    if(entity.$?.removed)obj.removed = +entity.$.removed
                    result = obj
                }

                target[resultFieldName].push(result)
            }
        }
        else{
            let value = entities[0].$.value

            let valueType = SC2Types[structure[field]]
            if(valueType.constructor === Function) {
                if(value === undefined){
                    value = entities
                }
                value = valueType(value, Instance)
            }
            else if(value !== undefined && value !== null && valueType === Number){
                value = +value
            }

            if(value !== undefined && value !== null){
                target[resultFieldName] = value
            }
        }
    }
}



let regexp = {
    iconpath: /.*[\\\/]/,
    iconext: /\.dds$/i,
    editorCategoryRace: /Race:(\w+)/,
    editorCategoryObjectFamily: /ObjectFamily:(\w+)/,
    editorCategoryObjectType: /ObjectType:(\w+)/
}

    // <EditorCategories value="ObjectType:Hero,ObjectFamily:Campaign"/>

let SC2TypesPostProseccsing = {
    SC2Icon: ((value) => value.toLowerCase())
}
let SC2Types = {
    SC2Icon: ((value) => {
        if(value.constructor === Array)return null;
        return (value.replace(regexp.iconpath, "").replace(regexp.iconext, "")).toLowerCase()
    }),
    SC2Color: ((value) => ("#"+value.split(",").slice(1).map(i => (+i).toString(16).padStart(2, '0')).join(""))),
    SC2Link: String,
    SC2LinkUnit: String,
    SC2LinkRace: String,
    SC2LinkButton: String,
    SC2LinkActor: String,
    SC2LinkUpgrade: String,
    SC2LinkBehavior: String,
    SC2LinkScore: String,
    SC2LinkWeapon: String,
    SC2LinkEffect: String,
    SC2LinkAbility: String,
    SC2LinkType: String,
    SC2LinkUserState: String,
    SC2LinkUserCommander: String,
    SC2LinkUserPrestige: String,
    SC2LinkUserLevel: String,
    SC2LinkUserTech: String,
    String: String,
    Number: Number,
    SC2EditorRace: ((value) => {
        return (value.match(regexp.editorCategoryRace)?.[1])
    }),
    SC2EditorObjectFamily: ((value) => {
        return (value.match(regexp.editorCategoryObjectFamily)?.[1])
    }),
    SC2EditorObjectType: ((value) => {
        return (value.match(regexp.editorCategoryObjectType)?.[1])
    }),
    SC2AbilCmd: ((value) => value[0].$.Abil + (value[0].$.Cmd ? ','+value[0].$.Cmd :''))
}

function parsegameData (raw) {
    return new Promise((resolve, reject) => {
        parser.parseString(raw, function (err, result) {
            if(err)reject(err)
            resolve(result);
        });
    })
}


async function getGameData(mods){

    const structure = JSON.parse(fs.readFileSync("./structure.json", {encoding: 'utf-8'}))
    const catalogsBase = "Abil,Actor,Behavior,Button,Race,ScoreValue,Skin,Unit,Upgrade,Race,User,Effect,Weapon".split(",").map(el => `GameData/${el}Data.xml`)

    const IGNORE = {ignore: true}
    const BaseData = {
        units: {
            SS_Plane: IGNORE,
            SS_BackgroundSpace: IGNORE,
            // ExtendingBridge: IGNORE,
            // AiurTempleStoneGate: IGNORE,
            // MetalGate: IGNORE,
            // Tarsonis_Door: IGNORE,
            // StarShipAdun_Door: IGNORE,
            // Purifier_Door: IGNORE,
            // ProtossBridge: IGNORE,
            Shape: IGNORE,
            MISSILE_INVULNERABLE: IGNORE,
            MISSILE: IGNORE,
            MISSILE_HALFLIFE: IGNORE,
            // DESTRUCTIBLE: {},
            PLACEHOLDER: IGNORE,
            SMCHARACTER: IGNORE,
            SMCAMERA: IGNORE,
            SMSET: IGNORE,
            // BEACON: {},
            // PATHINGBLOCKER: {},
            ITEM: IGNORE,
            // War3_Army: {},
            // War3_Missile: IGNORE
        }
    }

    let gameData =  objectAssignDeep({},BaseData )
    for(let mod of mods){

        let catalogsPaths = catalogsBase.slice();

        let modPath = mod + "/"

        let IncludesDataFile = modPath + "GameData.xml";
        if (fs.existsSync(IncludesDataFile)) {
            let includesDataRaw = fs.readFileSync(IncludesDataFile, {encoding: 'utf-8'})
            let IncludesData = await parsegameData(includesDataRaw)
            catalogsPaths.push(...IncludesData.Includes.Catalog.map(catalog => catalog.$.path))
        }

        for(let catalogPath of catalogsPaths){
            let fullCatalogPath = modPath + catalogPath
            if (fs.existsSync(fullCatalogPath)) {
                let catalogDataRaw = fs.readFileSync(fullCatalogPath, {encoding: 'utf-8'})
                let catalogDataXML = await parsegameData(catalogDataRaw)
                AssignData(gameData, catalogDataXML.Catalog,structure)
            }
        }
    }


    let missedTypes = {}
    function resolveParentRecoursive(data,instanceId){
        let instance = data[instanceId]
        let parentId = instance.parent
        if(parentId){
            let parent = data[parentId]
            delete instance.parent
            if(parent){
                resolveParentRecoursive(data,parentId)
                data[instanceId] = objectAssignDeep({}, parent ,instance)
            }
            else{
                if(!missedTypes[instanceType]){
                    missedTypes[instanceType] = {}
                }
                if(!missedTypes[instanceType][parentId] ){
                    missedTypes[instanceType][parentId] = {}
                }
            }
        }
    }

    for(let field in structure) {
        let {resultFieldName} = parseField(field)
        if (structure[field].parent) {
            for(let instanceId in gameData[resultFieldName]){
                resolveParentRecoursive(gameData[resultFieldName],instanceId)
            }
        }
    }

    function readStructureRecoursve(data, structure){
        for(let field in structure) {
            let {resultFieldName} = parseField(field)
            if(data[resultFieldName]){

                if(SC2TypesPostProseccsing[structure[field]]){
                    data[resultFieldName] = SC2TypesPostProseccsing[structure[field]](data[resultFieldName])
                    if(data[resultFieldName] === null){
                        delete data[resultFieldName]
                    }
                }
                else if(structure[field].constructor === Object){
                    for (let instanceId in data[resultFieldName]) {
                        readStructureRecoursve(data[resultFieldName][instanceId],structure[field])
                    }
                }
                else if(structure[field].constructor === Array ){
                    //converting to Object
                    {
                        let resultObject = {};
                        for(let i in data[resultFieldName]){
                            let item = data[resultFieldName][i]
                            let index = item.index
                            if(index !== undefined){
                                delete item.index
                                if(item.removed){
                                    delete resultObject[index]
                                    continue
                                }
                            }
                            else{
                                index = 0
                                while(resultObject[index])index++
                            }

                            if(resultObject[index]){
                                objectAssignDeep(resultObject[index],item)
                            }
                            else{
                                resultObject[index] = item
                            }
                        }
                        data[resultFieldName] = Object.values(resultObject)
                    }
                    for (let instance of data[resultFieldName]) {
                        readStructureRecoursve(instance,structure[field])
                    }
                }
            }
        }
    }

    readStructureRecoursve(gameData,structure)

    
    return gameData
}


(async function run(){
    let modsPath = "./../coop"
    let gameData = await getGameData([
        "./gamedata/0.Core",
        "./gamedata/1.Liberty",
        "./gamedata/2.Swarm",
        "./gamedata/3.Void",
        "./gamedata/4.LibertyCampaign",
        "./gamedata/5.SwarmCampaign",
        "./gamedata/6.VoidCampaign",
        "./gamedata/7.VoidMulti",
        `${modsPath}/ARC - Core.SC2Mod/Base.SC2Data`,
        // `${modsPath}/RACE - Scion.SC2Mod/Base.SC2Data`,
        // `${modsPath}/RACE - Talon.SC2Mod/Base.SC2Data`,
        // `${modsPath}/RACE - Hybrids.SC2Mod/Base.SC2Data`,
        // `${modsPath}/RACE - Dragons.SC2Mod/Base.SC2Data`,
        // `${modsPath}/RACE - UED.SC2Mod/Base.SC2Data`,
        // `${modsPath}/RACE - UPL.SC2Mod/Base.SC2Data`,
        // `${modsPath}/ARC - Extras.SC2Mod/Base.SC2Data`,
        // "./gamedata/8.WarCraft",
        // `${modsPath}/RACE - WarCraft.SC2Mod/Base.SC2Data`,
        // `${modsPath}/ARC - WarCraft.SC2Mod/Base.SC2Data`,
    ])


        //remove technical races
    for(let id in gameData.races){
        if(!gameData.races[id].AttributeId && !gameData.races[id].icon){
            delete gameData.races[id]
        }
        else{
            delete gameData.races[id].AttributeId
        }
    }

    let ignored = 0
    for(let type in gameData){
        for(let id in gameData[type]){
            if(gameData[type][id].race === "Other" || gameData[type][id].ignore === true){
                ignored++
                delete gameData[type][id]
            }
        }
    }
    console.log("ignored " + ignored)

    for(let actorID in gameData.actors){
        let actor = gameData.actors[actorID]
        let unitName = actor.unit || actorID
        let unit = gameData.units[unitName]
        if(unit){
            unit.actor = actorID
        }
        if(actor.events){
            for(let eventIndex in actor.events){
                let event = actor.events[eventIndex]
                if(event.Send === "Create" && event.Terms?.match(/^(UnitConstruction|UnitBirth)/)){
                    let eventUnitID = event.Terms.split(".")[1].replace("##unitname##", unitName).replace("##id##", actorID)

                    let eventUnit = gameData.units[eventUnitID]
                    if(eventUnit && !eventUnit.actor){
                        eventUnit.actor = actorID
                    }
                }
            }
        }
        delete actor.events;
    }


    let images = [];

    fs.readdirSync('./../all-races-coop-web/public/assets/buttons/').forEach(file => {
        if(file.endsWith(".png")){
            images.push(file.substring(0,file.length - 4))
        }
    });


    deepReplaceMatch(gameData, null, prop => prop === "icon" || prop === "wireframe", ({val, obj, prop, id}) => {
        if(obj.unit){
            val = val.replace("##unitname##",obj.unit)
        }
        val = val.replace("##id##", id)

        obj[prop] = val.toLowerCase()

        if(!fs.existsSync(`./../all-races-coop-web/public/assets/buttons/${obj[prop]}.png`)){
            obj[prop + "broken"] = true
        }

        // if(val.toLowerCase().startsWith("btn-")){
        //     obj[prop] = val.toLowerCase()
        // }
        // if(val.toLowerCase().startsWith("wireframe-")){
        //     obj[prop] = val.toLowerCase()
        // }
        // if(!images.includes(obj[prop])){
        //     obj[prop + "broken"] = true
        // }
    })

    for(let unitID in gameData.units){
        let unit = gameData.units[unitID]
        if(unit.actor){
            let actor = gameData.actors[unit.actor]

            if(actor.icon === "btn-missing-kaeo" ){
                delete actor.icon
            }




            if(actor.icon && !actor.iconbroken){
                unit.icon = actor.icon
            }
            else if (actor.wireframe && !actor.wireframebroken){
                unit.icon = actor.wireframe
            }
            else if(actor.icon || actor.wireframe){
                unit.icon = actor.icon || actor.wireframe
                unit.iconbroken = true
            }
            if(actor.iconbroken){
                console.warn(actor.icon)
            }
            if((!actor.icon || actor.iconbroken) && actor.wireframebroken){
                console.warn(actor.wireframe)
            }

            if(actor.LifeArmorIcon){
                unit.LifeArmorIcon = actor.LifeArmorIcon
            }
            if(actor.ShieldArmorIcon){
                unit.ShieldArmorIcon = actor.ShieldArmorIcon
            }

            // if(unit.icon == "btn-unit-upl-InfantryOfficer"){
            //     console.log("##")
            // }

            delete unit.actor
        }

        if(!unit.icon &&!unit.priority || unit.NoPalettes || unit.NoPlacement){
          //  console.log(unitID)
            delete gameData.units[unitID]
        }
    }
    // delete gameData.actors

    for(let id in gameData.units){
        let unit = gameData.units[id]
        if(unit.weapons) unit.weapons = unit.weapons.map(i => i.Link)
        if(unit.abilities) unit.abilities = unit.abilities.map(i => i.Link)
        if(unit.behaviors) unit.behaviors = unit.behaviors.map(i => i.Link)
        if(unit.card){
            for(let layoutindex in unit.card){
                let layout = unit.card[layoutindex].LayoutButtons
                unit.card[layoutindex] = {}
                if(layout){
                    for(let {Column,Row,Face} of layout){
                        Column = +Column || 0
                        Row = +Row || 0
                        if(Column > 3 || Row > 2)continue;
                        let position = Column + "x" + Row
                        if(!unit.card[layoutindex][position]){
                            unit.card[layoutindex][position] = []
                        }
                        unit.card[layoutindex][position].push(Face)
                    }
                }
            }
        }
    }
    gameData.icons = images
    // gameData.tech = Object.values(gameData.tech)


    for(let abilityID in gameData.abilities){
        let ability = gameData.abilities[abilityID]
        if(ability.info){
            for(let abilCmdID in ability.info){
                let abilCmd = ability.info[abilCmdID]
                if(!abilCmd.Unit || !abilCmd.button){
                    delete ability.info[abilCmdID]
                }
            }
        }
    }



    let finalDataBeautified = JSON.stringify(gameData, null, "\t");


    fs.writeFileSync("./../all-races-coop-web/public/gamedata.json",finalDataBeautified)
    fs.writeFileSync("./../all-races-coop-web-heroku/gamedata.json",finalDataBeautified)
})()