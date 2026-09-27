require("dotenv").config();
const fs = require("fs");
const {
  Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message]
});

const feedbackFile = "./data/feedbacks.json";
function feedbacks() {
  if (!fs.existsSync("./data")) fs.mkdirSync("./data", {recursive:true});
  if (!fs.existsSync(feedbackFile)) fs.writeFileSync(feedbackFile, "[]");
  try { return JSON.parse(fs.readFileSync(feedbackFile, "utf8")); } catch { return []; }
}
function saveFeedback(x) { fs.writeFileSync(feedbackFile, JSON.stringify(x, null, 2)); }
const slug = x => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");

function feedbackPanel(ticket="Atendimento") {
  const menu = new StringSelectMenuBuilder().setCustomId("feedback_rating").setPlaceholder("Escolha sua avaliação...")
    .addOptions(
      {label:"5 estrelas — Excelente",value:"5",emoji:"⭐"},
      {label:"4 estrelas — Muito bom",value:"4",emoji:"⭐"},
      {label:"3 estrelas — Bom",value:"3",emoji:"⭐"},
      {label:"2 estrelas — Regular",value:"2",emoji:"⭐"},
      {label:"1 estrela — Ruim",value:"1",emoji:"⭐"}
    );
  return {embeds:[new EmbedBuilder().setTitle("⭐ Avalie seu atendimento").setDescription(`Obrigado por utilizar a **Rucheyy Store | Developer**!\\n\\nAvalie o atendimento **${ticket}**.`).setColor(0x5865F2)],components:[new ActionRowBuilder().addComponents(menu)]};
}

async function createTicket(interaction,label,type) {
  const guild=interaction.guild;
  const old=guild.channels.cache.find(c=>c.type===ChannelType.GuildText && c.topic===`ticket:${interaction.user.id}`);
  if(old) return interaction.reply({content:`❌ Você já possui um ticket: ${old}`,ephemeral:true});
  const role=process.env.STAFF_ROLE_ID ? guild.roles.cache.get(process.env.STAFF_ROLE_ID) : null;
  const parent=type==="PRODUTO" ? process.env.PRODUCT_CATEGORY_ID : process.env.SUPPORT_CATEGORY_ID;
  const overwrites=[
    {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]}
  ];
  if(role) overwrites.push({id:role.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]});
  const ch=await guild.channels.create({name:`${slug(label).slice(0,18)}-${slug(interaction.user.username).slice(0,20)}`,type:ChannelType.GuildText,parent:parent||undefined,topic:`ticket:${interaction.user.id}`,permissionOverwrites:overwrites});
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim").setLabel("Assumir").setEmoji("🙋").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("close").setLabel("Fechar ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
  );
  await ch.send({content:`${interaction.user}${role?` ${role}`:""}`,embeds:[new EmbedBuilder().setTitle(`${type==="PRODUTO"?"🛒":"🎫"} ${label}`).setDescription(`Olá ${interaction.user}!\\n\\n**Solicitação:** ${label}\\n**Cliente:** ${interaction.user}\\n\\nA equipe da **Rucheyy Store | Developer** atenderá você aqui.`).setColor(0x5865F2).setTimestamp()],components:[row]});
  await interaction.reply({content:`✅ Ticket criado: ${ch}`,ephemeral:true});
}

const commands=[
 new SlashCommandBuilder().setName("painel").setDescription("Envia painel da loja.").addStringOption(o=>o.setName("tipo").setDescription("Tipo").setRequired(true).addChoices({name:"Suporte",value:"suporte"},{name:"Produtos",value:"produtos"})).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 new SlashCommandBuilder().setName("mensagem").setDescription("Envia uma mensagem.").addStringOption(o=>o.setName("texto").setDescription("Texto").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
 new SlashCommandBuilder().setName("embed").setDescription("Envia um embed.").addStringOption(o=>o.setName("titulo").setDescription("Título").setRequired(true)).addStringOption(o=>o.setName("descricao").setDescription("Descrição").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
 new SlashCommandBuilder().setName("add").setDescription("Adiciona usuário ao ticket.").addUserOption(o=>o.setName("usuario").setDescription("Usuário").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
 new SlashCommandBuilder().setName("remove").setDescription("Remove usuário do ticket.").addUserOption(o=>o.setName("usuario").setDescription("Usuário").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
 new SlashCommandBuilder().setName("notificar").setDescription("Envia DM.").addUserOption(o=>o.setName("usuario").setDescription("Usuário").setRequired(true)).addStringOption(o=>o.setName("mensagem").setDescription("Mensagem").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 new SlashCommandBuilder().setName("limpar").setDescription("Apaga mensagens.").addIntegerOption(o=>o.setName("quantidade").setDescription("1 a 100").setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
 new SlashCommandBuilder().setName("feedback").setDescription("Sistema de feedback.").addSubcommand(s=>s.setName("painel").setDescription("Envia painel")).addSubcommand(s=>s.setName("estatisticas").setDescription("Mostra estatísticas")).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(x=>x.toJSON());

async function register() {
 const rest=new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);
 await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),{body:commands});
 console.log("✅ Comandos registrados.");
}

client.once("ready",()=>{console.log(`✅ ${client.user.tag} está online!`);client.user.setActivity("Rucheyy Store | Developer",{type:3});});
client.on("interactionCreate",async i=>{
 try {
  if(i.isChatInputCommand()){
   const n=i.commandName;
   if(n==="painel"){
    const tipo=i.options.getString("tipo");
    if(tipo==="suporte") return i.reply({embeds:[new EmbedBuilder().setTitle("🎫 Central de Suporte").setDescription("Escolha seu atendimento.").setColor(0x5865F2)],components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("support").setPlaceholder("Selecione o suporte...").addOptions({label:"Tirar uma dúvida",value:"duvida",emoji:"🛠️"},{label:"Suporte da loja",value:"loja",emoji:"🏪"},{label:"Parceria",value:"parceria",emoji:"🤝"}))]});
    return i.reply({embeds:[new EmbedBuilder().setTitle("🛒 Produtos Rucheyy Store").setDescription("Escolha o produto.").setColor(0x5865F2)],components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("products").setPlaceholder("Selecione um produto...").addOptions({label:"Adquirir Servidor do Discord",value:"servidor",emoji:"🖥️"},{label:"Adquirir bot para Discord",value:"bot",emoji:"🤖"},{label:"Adquirir um site",value:"site",emoji:"🌐"},{label:"Produto personalizado",value:"personalizado",emoji:"✨"}))]});
   }
   if(n==="mensagem"){await i.channel.send(i.options.getString("texto"));return i.reply({content:"✅ Enviado.",ephemeral:true});}
   if(n==="embed"){await i.channel.send({embeds:[new EmbedBuilder().setTitle(i.options.getString("titulo")).setDescription(i.options.getString("descricao")).setColor(0x5865F2)]});return i.reply({content:"✅ Embed enviado.",ephemeral:true});}
   if(n==="add"){if(!i.channel.topic?.startsWith("ticket:"))return i.reply({content:"❌ Não é ticket.",ephemeral:true});const u=i.options.getUser("usuario");await i.channel.permissionOverwrites.edit(u.id,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true});return i.reply(`✅ ${u} adicionado.`);}
   if(n==="remove"){const u=i.options.getUser("usuario");await i.channel.permissionOverwrites.delete(u.id).catch(()=>{});return i.reply(`✅ ${u} removido.`);}
   if(n==="notificar"){const u=i.options.getUser("usuario"),m=i.options.getString("mensagem");try{await u.send(`🔔 **Rucheyy Store | Developer**\\n\\n${m}`);return i.reply({content:"✅ Notificação enviada.",ephemeral:true});}catch{return i.reply({content:"❌ DM bloqueada.",ephemeral:true});}}
   if(n==="limpar"){const q=i.options.getInteger("quantidade");await i.channel.bulkDelete(q,true);return i.reply({content:`🧹 ${q} mensagens apagadas.`,ephemeral:true});}
   if(n==="feedback"){if(i.options.getSubcommand()==="painel")return i.reply(feedbackPanel());const a=feedbacks();const avg=a.length?(a.reduce((s,x)=>s+x.rating,0)/a.length).toFixed(2):"0";return i.reply({embeds:[new EmbedBuilder().setTitle("📊 Feedbacks").setDescription(`**Avaliações:** ${a.length}\\n**Média:** ${avg}/5`).setColor(0x5865F2)]});}
  }
  if(i.isStringSelectMenu()){
   if(i.customId==="support"){const m={duvida:["Dúvida","SUPORTE"],loja:["Suporte da Loja","SUPORTE"],parceria:["Parceria","SUPORTE"]};const x=m[i.values[0]];return createTicket(i,x[0],x[1]);}
   if(i.customId==="products"){const m={servidor:"Servidor do Discord",bot:"Bot para Discord",site:"Site",personalizado:"Produto Personalizado"};return createTicket(i,m[i.values[0]],"PRODUTO");}
   if(i.customId==="feedback_rating"){const Modal=require("discord.js").ModalBuilder,Input=require("discord.js").TextInputBuilder,Style=require("discord.js").TextInputStyle;const modal=new Modal().setCustomId(`feedback:${i.values[0]}`).setTitle("Seu feedback");modal.addComponents(new ActionRowBuilder().addComponents(new Input().setCustomId("comment").setLabel("Comentário (opcional)").setStyle(Style.Paragraph).setRequired(false).setMaxLength(1000)));return i.showModal(modal);}
  }
  if(i.isButton()){
   if(i.customId==="claim"){if(!i.memberPermissions.has(PermissionFlagsBits.ManageChannels))return i.reply({content:"❌ Sem permissão.",ephemeral:true});return i.reply(`🙋 **${i.user.tag}** assumiu o atendimento.`);}
   if(i.customId==="close"){if(!i.memberPermissions.has(PermissionFlagsBits.ManageChannels))return i.reply({content:"❌ Sem permissão.",ephemeral:true});const id=i.channel.topic?.split(":")[1];const u=id?await i.guild.members.fetch(id).catch(()=>null):null;if(u)await u.send(feedbackPanel(i.channel.name)).catch(()=>{});await i.reply({content:"🔒 Fechando. O cliente recebeu o feedback.",ephemeral:true});return setTimeout(()=>i.channel.delete().catch(()=>{}),5000);}
  }
  if(i.isModalSubmit()&&i.customId.startsWith("feedback:")){const rating=Number(i.customId.split(":")[1]);const comment=i.fields.getTextInputValue("comment")||"Sem comentário.";const a=feedbacks();a.push({userId:i.user.id,username:i.user.tag,rating,comment,createdAt:new Date().toISOString()});saveFeedback(a);const ch=process.env.FEEDBACK_CHANNEL_ID?i.guild?.channels.cache.get(process.env.FEEDBACK_CHANNEL_ID):null;if(ch)await ch.send({embeds:[new EmbedBuilder().setTitle("⭐ Novo feedback").setDescription(`**${"⭐".repeat(rating)}${"☆".repeat(5-rating)}**\\n\\n${comment}`).addFields({name:"Cliente",value:`${i.user}`,inline:true}).setColor(0x5865F2).setTimestamp()]}).catch(()=>{});return i.reply({content:"✅ Feedback registrado. Obrigado!",ephemeral:true});}
 } catch(e){console.error(e);if(!i.replied)await i.reply({content:"❌ Ocorreu um erro.",ephemeral:true}).catch(()=>{});}
});

(async()=>{await register();await client.login(process.env.DISCORD_TOKEN);})();