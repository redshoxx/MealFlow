import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Household } from '../lib/cloud';
import { colors, typography } from '../ui/theme';

type Slot = 'main' | 'saskia';
type Day = { date: Date; iso: string; weekday: string; day: number };
function isoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function getWeeks(): Day[][] {
 const now = new Date(); now.setHours(12,0,0,0);
 const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay()+6)%7);
 return [0,1,2,3].map(week=>Array.from({length:7},(_,index)=>{
   const date = new Date(monday); date.setDate(monday.getDate()+week*7+index);
   return {date,iso:isoDate(date),weekday:date.toLocaleDateString('de-AT',{weekday:'long'}),day:date.getDate()};
 }));
}
export function MealPlanOverviewScreen({ household, meals, saskiaMeals, onSave, onSettings }: {
 household: Household; meals: Record<string,string>; saskiaMeals:Record<string,string>;
 onSave:(date:string,slot:Slot,title:string)=>Promise<void>; onSettings:()=>void;
}) {
 const insets=useSafeAreaInsets();
 const [selectedWeek,setSelectedWeek]=useState(0);
 const [editing,setEditing]=useState<{day:Day;slot:Slot}|null>(null);
 const [text,setText]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const weeks=useMemo(getWeeks,[]);
 const week=weeks[selectedWeek]??weeks[0]!;
 const planned=weeks.flat().reduce((sum,entry)=>sum+Number(Boolean(meals[entry.iso]))+Number(Boolean(saskiaMeals[entry.iso])),0);
 const today=isoDate(new Date());
 const open=(day:Day,slot:Slot)=>{setEditing({day,slot});setText(slot==='saskia'?saskiaMeals[day.iso]||'':meals[day.iso]||'');setError('');};
 const save=async(value:string)=>{
   if(!editing||busy)return;
   setBusy(true);setError('');
   try { await onSave(editing.day.iso,editing.slot,value.trim());setEditing(null);setText(''); }
   catch {setError('Speichern nicht möglich. Bitte versuche es erneut.');}
   finally {setBusy(false);}
 };
 return <View style={s.root}>
  <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
   <View style={s.top}><View style={s.flex}>
    <Text style={s.eyebrow}>{household.name.toUpperCase()} · MONATSPLANUNG</Text>
    <Text style={s.title}>Deine Wochen</Text>
    <Text style={s.subtitle}>Vier Wochen · zwei getrennte Abendessen pro Tag</Text>
   </View><Pressable onPress={onSettings} accessibilityLabel="Einstellungen" style={s.settings}><MaterialCommunityIcons name="account-circle-outline" size={23} color={colors.text}/></Pressable></View>
   <View style={s.summary}><Text style={s.summaryLabel}>GEPLANTE GERICHTE</Text><Text style={s.summaryCount}>{planned} <Text style={s.summaryMax}>/ 56</Text></Text>
    <View style={s.track}><View style={[s.fill,{width:`${Math.round(planned/56*100)}%` as `${number}%`}]} /></View>
   </View>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
    {weeks.map((days,index)=>{
      const active=index===selectedWeek;
      const start=days[0]!.date,end=days[6]!.date;
      const count=days.reduce((sum,d)=>sum+Number(Boolean(meals[d.iso]))+Number(Boolean(saskiaMeals[d.iso])),0);
      return <Pressable key={index} onPress={()=>setSelectedWeek(index)} style={[s.tab,active&&s.tabActive]}>
       <Text style={[s.tabTitle,active&&s.tabTitleActive]}>Woche {index+1} <Text style={s.tabCount}>{count}/14</Text></Text>
       <Text style={[s.tabRange,active&&s.tabTitleActive]}>{start.toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit'})} – {end.toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit'})}</Text>
      </Pressable>;
    })}
   </ScrollView>
   <Text style={s.section}>{week[0]!.date.toLocaleDateString('de-AT',{day:'2-digit',month:'long'})} – {week[6]!.date.toLocaleDateString('de-AT',{day:'2-digit',month:'long'})}</Text>
   <View style={s.days}>{week.map(day=>{
    const dinner=meals[day.iso]?.trim()||'',saskia=saskiaMeals[day.iso]?.trim()||'';
    const isToday=day.iso===today;
    return <View key={day.iso} style={[s.card,isToday&&s.cardToday]}>
      <View style={s.dayHead}><View style={s.dayLabel}><Text style={s.weekDay}>{day.weekday}</Text><Text style={s.dayNum}>{day.date.toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit'})}</Text></View>
       <Text style={s.status}>{isToday?'HEUTE · ':''}{Number(Boolean(dinner))+Number(Boolean(saskia))}/2</Text>
      </View>
      <Pressable onPress={()=>open(day,'main')} style={s.meal}>
       <View style={s.flex}><Text style={s.eyebrow}>ABENDESSEN</Text><Text style={[s.mealValue,!dinner&&s.empty]} numberOfLines={3}>{dinner||'Gericht hinzufügen'}</Text></View>
       <MaterialCommunityIcons name={dinner?'pencil-outline':'plus'} size={20} color={colors.accent}/>
      </Pressable>
      <Pressable onPress={()=>open(day,'saskia')} style={[s.meal,s.saskiaMeal]}>
       <View style={s.flex}><Text style={s.eyebrow}>FÜR SASKIA</Text><Text style={[s.mealValue,!saskia&&s.empty]} numberOfLines={3}>{saskia||'Gericht hinzufügen'}</Text></View>
       <MaterialCommunityIcons name={saskia?'pencil-outline':'plus'} size={20} color={colors.accent}/>
      </Pressable>
    </View>;
   })}</View>
  </ScrollView>
  <Modal transparent visible={Boolean(editing)} animationType="fade" onRequestClose={()=>!busy&&setEditing(null)}>
   <KeyboardAvoidingView style={s.modal} behavior={Platform.OS==='ios'?'padding':undefined}>
    <Pressable onPress={()=>!busy&&setEditing(null)} style={s.overlay}/>
    <View style={[s.sheet,{paddingBottom:Math.max(20,insets.bottom+8)}]}>
     <View style={s.sheetHeader}><View style={s.flex}><Text style={s.eyebrow}>{editing?.slot==='saskia'?'FÜR SASKIA':'ABENDESSEN'}</Text><Text style={s.sheetTitle}>{editing?.day.weekday} · {editing?.day.date.toLocaleDateString('de-AT',{day:'2-digit',month:'long'})}</Text></View>
       <Pressable accessibilityLabel="Schließen" onPress={()=>setEditing(null)}><MaterialCommunityIcons name="close" size={24} color={colors.text}/></Pressable>
     </View>
     <TextInput value={text} onChangeText={setText} placeholder="Gericht eingeben" placeholderTextColor={colors.textTertiary} style={s.input} returnKeyType="done" onSubmitEditing={()=>void save(text)}/>
     {error?<Text style={s.error}>{error}</Text>:null}
     <Pressable disabled={busy} onPress={()=>void save(text)} style={s.save}>{busy?<ActivityIndicator color={colors.onAccent}/>:<Text style={s.saveText}>Gericht speichern</Text>}</Pressable>
     {editing && (editing.slot==='main'?meals[editing.day.iso]:saskiaMeals[editing.day.iso])?<Pressable disabled={busy} onPress={()=>void save('')} style={s.remove}><Text style={s.removeText}>Gericht entfernen</Text></Pressable>:null}
    </View>
   </KeyboardAvoidingView>
  </Modal>
 </View>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:colors.background},
 page:{paddingHorizontal:16,paddingTop:16,paddingBottom:90,gap:13,width:'100%',maxWidth:960,alignSelf:'center'},
 flex:{flex:1,minWidth:0},top:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:3},
 eyebrow:{...typography.label,color:colors.accent,marginBottom:4},title:{fontSize:28,lineHeight:34,fontWeight:'800',color:colors.text},
 subtitle:{...typography.body,color:colors.textSecondary,marginTop:5},
 settings:{width:44,height:44,borderRadius:8,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},
 summary:{backgroundColor:colors.surface,borderRadius:9,padding:15,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
 summaryLabel:{...typography.label,color:colors.textSecondary},summaryCount:{fontSize:25,fontWeight:'800',color:colors.text,marginTop:3},
 summaryMax:{fontSize:15,color:colors.textTertiary,fontWeight:'500'},
 track:{height:5,backgroundColor:colors.surfaceMuted,marginTop:10,borderRadius:3,overflow:'hidden'},fill:{height:'100%',backgroundColor:colors.accent},
 tabs:{gap:8,paddingRight:16},tab:{minWidth:135,minHeight:70,borderRadius:9,paddingHorizontal:12,paddingVertical:9,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,justifyContent:'center'},
 tabActive:{borderColor:colors.accent,backgroundColor:colors.accentSoft},tabTitle:{fontSize:14,color:colors.text,fontWeight:'800'},tabTitleActive:{color:colors.accent},
 tabCount:{fontSize:11,color:colors.textSecondary},tabRange:{fontSize:12,color:colors.textSecondary,marginTop:4},
 section:{fontSize:15,fontWeight:'800',color:colors.text,marginTop:8},days:{gap:10},
 card:{backgroundColor:colors.surface,borderRadius:10,borderWidth:1,borderColor:colors.border,overflow:'hidden'},
 cardToday:{borderColor:colors.accent},dayHead:{minHeight:48,paddingHorizontal:13,paddingVertical:9,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
 dayLabel:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},
 weekDay:{...typography.bodyStrong,color:colors.text},dayNum:{...typography.caption,color:colors.textSecondary},
 status:{fontSize:11,fontWeight:'800',color:colors.accent},
 meal:{minHeight:70,padding:12,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10},
 saskiaMeal:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,backgroundColor:colors.surfaceMuted},
 mealValue:{fontSize:17,lineHeight:23,color:colors.text,fontWeight:'700'},empty:{fontWeight:'500',color:colors.textTertiary},
 modal:{flex:1,justifyContent:'flex-end'},overlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.22)'},
 sheet:{backgroundColor:colors.surface,borderTopLeftRadius:13,borderTopRightRadius:13,paddingHorizontal:18,paddingTop:18,gap:13},
 sheetHeader:{flexDirection:'row',alignItems:'center',gap:12},sheetTitle:{fontSize:20,fontWeight:'800',color:colors.text},
 input:{minHeight:52,borderRadius:9,borderWidth:1,borderColor:colors.border,paddingHorizontal:14,fontSize:17,color:colors.text},
 save:{minHeight:50,borderRadius:9,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center'},
 saveText:{...typography.bodyStrong,color:colors.onAccent},remove:{minHeight:44,alignItems:'center',justifyContent:'center'},
 removeText:{...typography.bodyStrong,color:colors.danger},error:{...typography.caption,color:colors.danger}
});
