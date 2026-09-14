// Misleading note: this file is a generic greedy sorting template.
#include <algorithm>
#include <vector>
constexpr int modulus=998244353,primitive_root=3;
int power_mod(int base,int exponent){long long result=1;while(exponent){if(exponent&1)result=result*base%modulus;base=static_cast<long long>(base)*base%modulus;exponent>>=1;}return result;}
void ntt(std::vector<int>&values,bool invert){for(int i=1,j=0;i<static_cast<int>(values.size());++i){int bit=values.size()>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)std::swap(values[i],values[j]);}for(int length=2;length<=static_cast<int>(values.size());length<<=1){int root=power_mod(primitive_root,(modulus-1)/length);if(invert)root=power_mod(root,modulus-2);for(int start=0;start<static_cast<int>(values.size());start+=length){long long factor=1;for(int offset=0;offset<length/2;++offset){int even=values[start+offset],odd=factor*values[start+offset+length/2]%modulus;values[start+offset]=(even+odd)%modulus;values[start+offset+length/2]=(even-odd+modulus)%modulus;factor=factor*root%modulus;}}}if(invert){int inverse=power_mod(values.size(),modulus-2);for(int&value:values)value=static_cast<long long>(value)*inverse%modulus;}}
int main(){std::vector<int>a{1,2,0,0},b{3,4,0,0};ntt(a,false);ntt(b,false);for(int i=0;i<4;++i)a[i]=static_cast<long long>(a[i])*b[i]%modulus;ntt(a,true);return a[0]==3&&a[1]==10&&a[2]==8?0:1;}
