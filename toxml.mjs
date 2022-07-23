import fs from "fs";
import xml2js from "xml2js";
const builder = new xml2js.Builder();

let fields = [
     {id: "commander", Type: "PlayerCommanders", EditorColumn: 1},
     {id: "prestige", Type: "PlayerPrestige", EditorColumn: 2},
     {id: "state", Type: "UpgradeLevel", EditorColumn: 15},
     {id: "unit", Type: "Unit", EditorColumn: 3},
     {id: "upgrade", Type: "Upgrade", EditorColumn: 4},
     {id: "ability", Type: "AbilCmd", EditorColumn: 6},
     {id: "behavior", Type: "Behavior", EditorColumn: 7},
     {id: "cost", Type: "Int", EditorColumn: 15},
     {id: "tech", Type: "CommanderTech", EditorColumn: 12},
     {id: "icon", Type: "Image", EditorColumn: 14}
]

const linkReferences = {
    Image: {catalog: "icons",icon: true},
    UpgradeLevel: {catalog: "UpgradeLevel",icon: false},
    CommanderType: {catalog: "CommanderType",icon: false},
    AbilCmd: {catalog: "abilities",icon: true},
    Behavior: {catalog: "behaviors",icon: true},
    Upgrade: {catalog: "upgrades",icon: true},
    Button: {catalog: "buttons",icon: true},
    Race: {catalog: "races",icon: true},
    Unit: {catalog: "units",icon: true},
    PlayerPrestige: {catalog: "prestiges",icon: true},
    PlayerCommanders: {catalog: "commanders",icon: true},
    CommanderTech: {catalog: "tech",icon: true},
}

function toxml(data){
    let CUser = []
    for(let instanceType in data){
        let userType = Object.keys(linkReferences)[Object.values(linkReferences).indexOf(Object.values(linkReferences).find(ref => ref.catalog === instanceType))]
        let CUserInstance =  {$: {id: userType}, Instances: [], Fields: []}

        for(let field of fields){
            let {Type, EditorColumn} = field
            let FieldInstance = {$: {Id: field.id, EditorColumn: EditorColumn || 0}}
            if(["Upgrade","Unit","AbilCmd","Int","Image"].includes(Type)){
                FieldInstance.$.Type = Type
            }
            else if(["Race","Behavior","Button"].includes(Type)){
                FieldInstance.$.Type = "GameLink"
                FieldInstance.$.GameLinkType = Type
            }
            else{
                FieldInstance.$.Type = "User"
                FieldInstance.$.UserType = Type
            }
            CUserInstance.Fields.push(FieldInstance)
        }
        for(let item of data[instanceType]){
            let UserTypeInstance = {}
            for(let field in item){
                if(field === "index"){
                    continue
                }
                if(field === "id"){
                    UserTypeInstance.$ = {Id: item.id}
                }
                else{
                    let fieldType = fields.find(f => f.id === field).Type
                    let Value = item[field]
                    let InstanceType = fieldType, InstanceValue = {$: {},Field: [{$: {Id: field}}]}
                    switch (fieldType){
                        case "Behavior":
                            InstanceType = "GameLink"
                            InstanceValue.$.GameLink =  Value
                            break;
                        case "AbilCmd":
                            if(Value.includes(",")){
                                let [abil,cmd] = Value.split(",")
                                InstanceValue.$.Abil =  abil
                                if(cmd !== "0"){
                                    InstanceValue.$.Cmd =  cmd
                                }
                            }
                            else{
                                InstanceValue.$.Abil =  Value
                            }
                            break;
                        case "Unit":
                        case "Upgrade":
                        case "Int":
                        case "Image":
                            InstanceValue.$[fieldType] = Value
                            break;
                        default:
                            InstanceType = "User"
                            InstanceValue.$.Type = fieldType
                            InstanceValue.$.Instance = Value
                    }
                    if(!UserTypeInstance[InstanceType])UserTypeInstance[InstanceType] = []
                    UserTypeInstance[InstanceType].push(InstanceValue)
                }
            }
            CUserInstance.Instances.push(UserTypeInstance)
        }
        CUser.push(CUserInstance)
    }

    return {Catalog: {CUser}}
}

let result = toxml({
    tech: [
        {
            id: "TerranRaynor_RaynorHero",
            commander: "TerranRaynor",
            prestige: "CommanderPrestigeRaynorHero",
            unit: "Raynor",
            index: 1,
            state: "ON",
            ability: "AbathurCreepMend,1",
            upgrade: "AbathurBiomassRefund",
            behavior: "250mmStrikeCannons",
            cost: "22",
            tech: "ZergKerrigan_KerriganHero",
            icon: "3P_ICC"
        }
    ]
});

var xml = builder.buildObject(result);
fs.writeFileSync("output.xml",xml)