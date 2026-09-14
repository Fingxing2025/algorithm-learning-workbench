// Neutral opaque name; classify from source.
#include <array>
#include <string>
#include <vector>
class SuffixAutomaton{struct State{int length=0,link=-1;std::array<int,26>next{};};std::vector<State>states{{}};int last=0;public:void extend(char ch){int current=states.size();states.push_back({states[last].length+1,-1,{}});int p=last,c=ch-'a';while(p>=0&&!states[p].next[c]){states[p].next[c]=current;p=states[p].link;}if(p<0)states[current].link=0;else{int q=states[p].next[c];if(states[p].length+1==states[q].length)states[current].link=q;else{int clone=states.size();states.push_back(states[q]);states[clone].length=states[p].length+1;while(p>=0&&states[p].next[c]==q){states[p].next[c]=clone;p=states[p].link;}states[q].link=states[current].link=clone;}}last=current;}long long distinct()const{long long answer=0;for(std::size_t i=1;i<states.size();++i)answer+=states[i].length-states[states[i].link].length;return answer;}};
int main(){SuffixAutomaton automaton;for(char ch:std::string("ababa"))automaton.extend(ch);return automaton.distinct()==9?0:1;}
