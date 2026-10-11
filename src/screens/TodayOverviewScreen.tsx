import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ShoppingItem, Household } from '../lib/cloud';
import { colors, typography } from '../ui/theme';

type Tab = 'heute' | 'woche' | 'einkauf' | 'rezepte';
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function TodayOverviewScreen({ household, items, meals, saskiaMeals, onNavigate, onSettings, onCooked, cooked = false }: {
  household: Household; items: ShoppingItem[]; meals: Record<string,string>; saskiaMeals: Record<string,string>;
  onNavigate: (tab: Tab) => void; onSettings: () => void; onCooked?: (title:string) => Promise<void>; cooked?: boolean;
}) {
 const now = new Date(), today = dateKey(now);
 const dinner = meals[today]?.trim() || '', saskia = saskiaMeals[today]?.trim() || '';
 const open = items.filter(item => !item.done);
 const coming = Array.from({ length: 3 }, (_,i) => { const d = new Date(now); d.setHours(12,0,0,0); d.setDate(d.getDate()+i+1); return {date:d,key:dateKey(d)}; });
 return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
   <View style={s.header}><View style={s.flex}>
    <Text style={s.eyebrow}>{now.toLocaleDateString('de-AT',{weekday:'long',day:'2-digit',month:'long'}).toUpperCase()}</Text>
    <Text style={s.title}>Dein Tag</Text><Text style={s.subtitle}>{household.name} · Alles Wichtige heute</Text>
   </View><Pressable onPress={onSettings} accessibilityLabel="Einstellungen" style={s.settings}><MaterialCommunityIcons name="account-circle-outline" size={24} color={colors.text}/></Pressable></View>
   <View style={s.metrics}>
    <Pressable style={s.metric} onPress={() => onNavigate('woche')}><Text style={s.metricNumber}>{Number(!dinner)+Number(!saskia)}</Text><Text style={s.metricCaption}>Gerichte offen</Text></Pressable>
    <Pressable style={s.metric} onPress={() => onNavigate('einkauf')}><Text style={s.metricNumber}>{open.length}</Text><Text style={s.metricCaption}>Einkaufsartikel offen</Text></Pressable>
   </View>
   <View style={s.section}><Text style={s.sectionTitle}>Essen heute</Text><Pressable onPress={() => onNavigate('woche')}><Text style={s.link}>Bearbeiten →</Text></Pressable></View>
   <View style={s.board}>{[{name:'ABENDESSEN',value:dinner},{name:'FÜR SASKIA',value:saskia}].map((meal,i)=><Pressable key={meal.name} onPress={() => onNavigate('woche')} style={[s.meal,i===0 && s.separator]}>
      <View style={s.flex}><Text style={s.eyebrow}>{meal.name}</Text><Text style={[s.mealTitle,!meal.value && s.muted]}>{meal.value || 'Noch nicht geplant'}</Text></View>
      <MaterialCommunityIcons name={meal.value ? 'pencil-outline':'plus'} size={22} color={colors.accent}/>
   </Pressable>)}</View>
   {dinner && !cooked && onCooked ? <Pressable onPress={() => void onCooked(dinner)} style={s.action}><MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.accent}/><Text style={s.actionText}>Als gekocht markieren</Text></Pressable> : null}
   <View style={s.section}><Text style={s.sectionTitle}>Die nächsten 3 Tage</Text><Pressable onPress={() => onNavigate('woche')}><Text style={s.link}>Wochenplan →</Text></Pressable></View>
   <View style={s.board}>{coming.map((day,i)=><Pressable key={day.key} onPress={() => onNavigate('woche')} style={[s.coming,i<2&&s.separator]}>
      <View style={s.date}><Text style={s.day}>{day.date.toLocaleDateString('de-AT',{weekday:'short'})}</Text><Text style={s.num}>{day.date.getDate()}</Text></View>
      <View style={s.flex}><Text style={s.comingTitle} numberOfLines={2}>{meals[day.key] || 'Abendessen offen'}</Text><Text style={s.comingExtra} numberOfLines={1}>{saskiaMeals[day.key] ? 'Saskia: '+saskiaMeals[day.key]:'Für Saskia noch offen'}</Text></View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary}/>
   </Pressable>)}</View>
   <View style={s.section}><Text style={s.sectionTitle}>Einkauf</Text><Pressable onPress={() => onNavigate('einkauf')}><Text style={s.link}>Zur Liste →</Text></Pressable></View>
   <Pressable onPress={() => onNavigate('einkauf')} style={s.board}>
    {open.length ? open.slice(0,4).map(item=><View key={item.id} style={s.shopping}><MaterialCommunityIcons name="circle-outline" size={17} color={colors.textTertiary}/><Text style={s.flexText} numberOfLines={1}>{item.name}</Text><Text style={s.amount}>{item.amount} {item.unit}</Text></View>) : <Text style={s.empty}>Keine offenen Artikel</Text>}
    {open.length>4?<Text style={s.link}>{open.length-4} weitere Artikel →</Text>:null}
   </Pressable>
   <Pressable onPress={() => onNavigate('rezepte')} style={s.action}><MaterialCommunityIcons name="book-open-page-variant-outline" size={20} color={colors.accent}/><Text style={s.actionText}>Rezepte aus echten Quellen entdecken →</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({
 page:{paddingHorizontal:16,paddingTop:18,paddingBottom:90,gap:13,maxWidth:960,width:'100%',alignSelf:'center'},
 flex:{flex:1,minWidth:0},header:{flexDirection:'row',gap:12,alignItems:'center',marginBottom:9},
 eyebrow:{...typography.label,color:colors.accent,marginBottom:6},title:{fontSize:29,lineHeight:35,color:colors.text,fontWeight:'800'},
 subtitle:{...typography.body,color:colors.textSecondary,marginTop:4},
 settings:{width:44,height:44,borderRadius:8,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},
 metrics:{flexDirection:'row',gap:9},metric:{flex:1,backgroundColor:colors.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.border,borderRadius:9,padding:13,minHeight:75},
 metricNumber:{fontSize:24,fontWeight:'800',color:colors.text},metricCaption:{fontSize:12,color:colors.textSecondary,marginTop:3},
 section:{marginTop:11,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
 sectionTitle:{fontSize:18,fontWeight:'800',color:colors.text},link:{fontSize:13,fontWeight:'700',color:colors.accent},
 board:{backgroundColor:colors.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.border,borderRadius:9,overflow:'hidden'},
 meal:{minHeight:88,padding:14,flexDirection:'row',alignItems:'center',gap:12},separator:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
 mealTitle:{fontSize:18,lineHeight:24,color:colors.text,fontWeight:'700'},muted:{color:colors.textTertiary,fontWeight:'500'},
 action:{minHeight:45,backgroundColor:colors.accentSoft,borderRadius:8,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:10},
 actionText:{...typography.bodyStrong,color:colors.accent,flexShrink:1},
 coming:{flexDirection:'row',alignItems:'center',gap:11,minHeight:75,padding:10},
 date:{width:47,minHeight:51,backgroundColor:colors.surfaceMuted,borderRadius:6,alignItems:'center',justifyContent:'center'},
 day:{fontSize:11,color:colors.textSecondary,fontWeight:'700'},num:{...typography.title,color:colors.text},
 comingTitle:{...typography.bodyStrong,color:colors.text},comingExtra:{...typography.caption,color:colors.textSecondary,marginTop:4},
 shopping:{flexDirection:'row',alignItems:'center',gap:9,minHeight:37,paddingHorizontal:12},
 flexText:{...typography.body,color:colors.text,flex:1},amount:{...typography.caption,color:colors.textSecondary},
 empty:{...typography.body,color:colors.textSecondary,padding:15}
});
